"""
schedule_builder.py
────────────────────
Core itinerary-generation engine for the AI Travel Guide.

Responsibilities
───────────────
1.  Select activities from the catalogue that suit the trip's travel styles,
    budget, and daily time window.
2.  Arrange selected activities across available days respecting:
      - Time-of-day preferences (morning / afternoon / evening).
      - Daily time budget (default 09:00–22:00 usable hours).
      - No time overlaps.
      - Trip's total budget_minor cap.
      - Locked activities: never removed, never moved.
3.  Return a ScheduleResult containing:
      - Built activities (list[ActivitySlot]).
      - A BudgetBreakdown per category.
      - Warnings (list[str]) for unresolvable constraints.

Design notes
────────────
- Pure Python; no database access.  The API layer persists the result.
- Uses only the activity_catalogue.py demo data.
- When a real live-data provider is connected, replace `get_catalogue()`
  with the provider's output; the scheduling logic is unchanged.
- All costs in INR minor units (paise) internally.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Optional

from app.algorithms.activity_catalogue import CatalogueActivity, get_catalogue


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

DAY_START_MINUTES = 9 * 60    # 09:00
DAY_END_MINUTES   = 22 * 60   # 22:00
USABLE_MINUTES    = DAY_END_MINUTES - DAY_START_MINUTES   # 780 min / day
TRAVEL_BUFFER     = 20        # minutes between activities (travel / transition)

DAY_PART_WINDOWS: dict[str, tuple[int, int]] = {
    "morning":   (DAY_START_MINUTES, 13 * 60),   # 09:00–13:00
    "afternoon": (12 * 60, 18 * 60),             # 12:00–18:00
    "evening":   (17 * 60, DAY_END_MINUTES),      # 17:00–22:00
    "anytime":   (DAY_START_MINUTES, DAY_END_MINUTES),
}


def _minutes_to_hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def _format_currency(minor: int, currency: str = "INR") -> str:
    """Format minor currency units cleanly according to trip currency."""
    sym_map = {
        "INR": "₹",
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "JPY": "¥",
        "SGD": "S$",
        "AED": "AED ",
        "THB": "฿",
    }
    cur = (currency or "INR").upper().strip()
    sym = sym_map.get(cur, f"{cur} ")
    major = minor // 100
    return f"{sym}{major:,}"


# ---------------------------------------------------------------------------
# Data structures returned by the engine
# ---------------------------------------------------------------------------

@dataclass
class ActivitySlot:
    """One activity placed in the schedule."""
    # Catalogue / user fields
    name: str
    category: str
    location: Optional[str]
    duration_minutes: int
    cost_minor: int
    opening_hours: Optional[str]
    booking_required: bool
    recommendation_reason: str

    # Scheduling output
    day_number: int          # 1-indexed
    start_time: str          # "HH:MM"
    end_time: str            # "HH:MM"

    # Carried from existing locked activities (None for newly generated)
    existing_id: Optional[int] = None
    is_locked: bool = False
    source: str = "curated"  # "curated" | "openstreetmap" | "demo_placeholder"
    is_demo: bool = False
    is_verified: bool = True


@dataclass
class BudgetBreakdown:
    """Estimated spending by category."""
    by_category: dict[str, int] = field(default_factory=dict)   # category → minor
    total_minor: int = 0
    budget_cap_minor: int = 0
    over_budget: bool = False
    over_budget_by_minor: int = 0


@dataclass
class DayPlan:
    """Explicit schedule plan and completeness status for one calendar day."""
    day_number: int
    date: str
    theme: Optional[str] = None
    status: str = "scheduled"   # "scheduled" | "partial" | "unfilled"
    unfilled_reason: Optional[str] = None
    activities: list[ActivitySlot] = field(default_factory=list)


@dataclass
class ScheduleResult:
    """Output of the schedule builder."""
    activities: list[ActivitySlot] = field(default_factory=list)
    budget: BudgetBreakdown = field(default_factory=BudgetBreakdown)
    warnings: list[str] = field(default_factory=list)
    is_demo: bool = True
    days: list[DayPlan] = field(default_factory=list)
    calendar_complete: bool = True
    schedule_complete: bool = True
    ai_enhanced: bool = False
    ai_unavailable_reason: Optional[str] = None


def _calculate_day_dates(departure_date: Optional[str], num_days: int) -> list[str]:
    """Calculate ISO date strings for every day 1..num_days using inclusive dates."""
    base_date = None
    if departure_date:
        try:
            from datetime import date
            base_date = date.fromisoformat(str(departure_date)[:10])
        except Exception:
            pass
    if not base_date:
        from datetime import date
        base_date = date.today()
    from datetime import timedelta
    return [(base_date + timedelta(days=i)).isoformat() for i in range(num_days)]


def _default_day_theme(day_number: int, day_activities: list[ActivitySlot], destination: str) -> str:
    dest_base = destination.split(",")[0].strip() or "Destination"
    if not day_activities:
        return f"Day {day_number}: Free Exploration in {dest_base}"
    cats = [a.category.lower() for a in day_activities]
    if any(c in ("heritage", "culture", "museum") for c in cats):
        if day_number == 1:
            return f"Historic Heritage & Cultural Beginnings"
        return f"Cultural Highlights & Historic Landmarks"
    elif any(c in ("nature", "park") for c in cats):
        return f"Scenic Landscapes & Natural Highlights"
    elif any(c in ("shopping", "market", "food") for c in cats):
        return f"Local Flavours & Artisan Markets"
    elif any(c in ("sightseeing", "viewpoint") for c in cats):
        return f"Panoramic Viewpoints & City Icons"
    return f"Day {day_number}: {dest_base} Discovery"


# ---------------------------------------------------------------------------
# Trip preference input (decoupled from ORM)
# ---------------------------------------------------------------------------

@dataclass
class TripPreferences:
    """Sanitised preferences extracted from a Trip ORM object."""
    destination: str
    num_days: int
    num_travellers: int
    budget_minor: int           # 0 = uncapped
    currency: str
    travel_styles: list[str]    # list of TravelStyle enum values as strings
    walking_tolerance: int      # 1–10
    travel_pace: int            # 1–10  (1=relaxed, 10=packed)
    food_pref: Optional[str]
    must_visit: Optional[str]
    avoid: Optional[str]
    departure_date: Optional[str] = None

    @classmethod
    def from_trip(cls, trip) -> "TripPreferences":
        """Build from a SQLAlchemy Trip ORM instance defensively."""
        styles: list[str] = []
        raw_styles = getattr(trip, "travel_styles", None)
        if raw_styles:
            styles = [s.strip() for s in str(raw_styles).split(",") if s.strip()]
        num_days = max(1, getattr(trip, "num_days", 1) or 1)
        num_travellers = max(1, getattr(trip, "num_travellers", 1) or 1)
        budget_minor = max(0, getattr(trip, "budget_minor", 0) or 0)
        currency = getattr(trip, "currency", "INR") or "INR"
        raw_pace = getattr(trip, "travel_pace", 5)
        if isinstance(raw_pace, str):
            pace_map = {"relaxed": 3, "slow": 3, "medium": 5, "moderate": 5, "fast": 8, "packed": 8}
            pace = pace_map.get(raw_pace.lower().strip(), 5)
        else:
            try:
                pace = int(raw_pace or 5)
            except (ValueError, TypeError):
                pace = 5
        pace = max(1, min(10, pace))

        raw_tol = getattr(trip, "walking_tolerance", 5)
        if isinstance(raw_tol, str):
            tol_map = {"low": 3, "medium": 5, "high": 8}
            walking_tol = tol_map.get(raw_tol.lower().strip(), 5)
        else:
            try:
                walking_tol = int(raw_tol or 5)
            except (ValueError, TypeError):
                walking_tol = 5
        walking_tol = max(1, min(10, walking_tol))
        dep_date = getattr(trip, "departure_date", None)
        dep_str = str(dep_date) if dep_date else None
        return cls(
            destination=getattr(trip, "destination", "Destination") or "Destination",
            num_days=num_days,
            num_travellers=num_travellers,
            budget_minor=budget_minor,
            currency=currency,
            travel_styles=styles,
            walking_tolerance=walking_tol,
            travel_pace=pace,
            food_pref=getattr(trip, "food_pref", None),
            must_visit=getattr(trip, "must_visit", None),
            avoid=getattr(trip, "avoid", None),
            departure_date=dep_str,
        )


# ---------------------------------------------------------------------------
# Locked activity input (existing Activity rows user wants to keep)
# ---------------------------------------------------------------------------

@dataclass
class LockedActivity:
    """A user-locked activity row passed in to be preserved."""
    id: int
    day_number: int
    name: str
    category: str
    location: Optional[str]
    start_time: Optional[str]    # "HH:MM" or None
    end_time: Optional[str]
    duration_minutes: int
    cost_minor: int
    opening_hours: Optional[str]
    booking_required: bool
    recommendation_reason: Optional[str]


# ---------------------------------------------------------------------------
# Core scoring
# ---------------------------------------------------------------------------

def _style_score(activity: CatalogueActivity, styles: list[str]) -> float:
    """0.0–1.0: fraction of trip styles matched by this activity."""
    if not styles:
        return 0.5   # neutral when no styles set
    matches = sum(1 for s in styles if s in activity["styles"])
    return matches / len(styles)


def _budget_weight(activity: CatalogueActivity, remaining_minor: float) -> float:
    """Penalise activities that are expensive when budget is tight."""
    if remaining_minor <= 0:
        return 0.0 if activity["cost_minor"] > 0 else 1.0
    ratio = activity["cost_minor"] / remaining_minor if remaining_minor else 0
    return max(0.0, 1.0 - ratio)


def _score(
    activity: CatalogueActivity,
    styles: list[str],
    remaining_minor: int,
    pace: int,
) -> float:
    style = _style_score(activity, styles)
    budget = _budget_weight(activity, remaining_minor)
    # High-pace travellers prefer more/longer activities; penalise very long ones slightly
    duration_penalty = max(0.0, (activity["duration_minutes"] - 360) / 360) if pace < 5 else 0.0
    return style * 0.55 + budget * 0.30 + (1.0 - duration_penalty) * 0.15


# ---------------------------------------------------------------------------
# Time-slot helpers
# ---------------------------------------------------------------------------

def _start_of_day_part(day_part: str, current_cursor: int) -> int:
    """Return the earliest start for an activity of this day_part."""
    window_start, _ = DAY_PART_WINDOWS.get(day_part, DAY_PART_WINDOWS["anytime"])
    return max(window_start, current_cursor)


def _fits_in_day(start: int, duration: int, day_part: str) -> bool:
    _, window_end = DAY_PART_WINDOWS.get(day_part, DAY_PART_WINDOWS["anytime"])
    end = start + duration
    return end <= min(window_end, DAY_END_MINUTES)


# ---------------------------------------------------------------------------
# Activities-per-day from pace (1=2 per day, 10=6 per day)
# ---------------------------------------------------------------------------

def _max_activities_per_day(pace: int) -> int:
    if pace <= 3:
        return 2
    elif pace <= 6:
        return 3
    elif pace <= 8:
        return 4
    else:
        return 5


# ---------------------------------------------------------------------------
# Avoid list filter
# ---------------------------------------------------------------------------

def _is_avoided(activity: CatalogueActivity, avoid: Optional[str]) -> bool:
    if not avoid:
        return False
    avoid_lower = avoid.lower()
    return any(kw.strip() in activity["name"].lower() or
               kw.strip() in activity["category"].lower()
               for kw in avoid_lower.split(","))


# ---------------------------------------------------------------------------
# Main schedule builder
# ---------------------------------------------------------------------------

def build_schedule(
    prefs: TripPreferences,
    locked: list[LockedActivity] | None = None,
    weather_days: list[dict] | None = None,
    candidate_places: list[any] | None = None,
) -> ScheduleResult:
    """
    Generate a multi-day itinerary for the trip described by *prefs*.

    Parameters
    ──────────
    prefs            : TripPreferences extracted from the Trip row.
    locked           : Existing locked Activity rows to preserve. These are placed
                       first on their assigned day; the algorithm fills gaps around them.
    weather_days     : Optional daily weather forecast list from Open-Meteo.
    candidate_places : Optional list of PlaceCandidate or CatalogueActivity objects.
                       If not provided, falls back to get_catalogue(prefs.destination).

    Returns
    ───────
    ScheduleResult with activity slots, budget breakdown, and any warnings.
    """
    result = ScheduleResult()
    locked = locked or []
    weather_days = weather_days or []

    # ── 0. Normalize candidate source ─────────────────────────────────────────
    raw_candidates: list[dict] = []
    if candidate_places is not None:
        for p in candidate_places:
            if hasattr(p, "name"):
                raw_candidates.append({
                    "name": p.name,
                    "category": p.category,
                    "location": p.location,
                    "duration_minutes": p.duration_minutes,
                    "cost_minor": p.cost_minor,
                    "opening_hours": p.opening_hours,
                    "booking_required": p.booking_required,
                    "recommendation_reason": p.description or f"Recommended place in {p.location}",
                    "styles": getattr(p, "styles", ["cultural", "leisurely"]),
                    "day_part": getattr(p, "day_part", "anytime"),
                    "is_indoor": getattr(p, "is_indoor", False),
                    "source": getattr(p, "source", "curated"),
                    "is_demo": getattr(p, "source", "curated") == "demo_placeholder",
                    "is_verified": getattr(p, "is_verified", True),
                })
            elif isinstance(p, dict):
                raw_candidates.append(dict(p))
    else:
        catalogue = get_catalogue(prefs.destination)
        for item in catalogue:
            raw_candidates.append(dict(item))

    # ── 1. Seed from locked activities ───────────────────────────────────────
    cursors: dict[int, int] = {d: DAY_START_MINUTES for d in range(1, prefs.num_days + 1)}
    total_cost = sum(la.cost_minor for la in locked)
    used_names: set[str] = set()

    # Place locked activities into the result first.
    for la in sorted(locked, key=lambda x: (x.day_number, x.start_time or "00:00")):
        if la.day_number < 1 or la.day_number > prefs.num_days:
            result.warnings.append(
                f"Locked activity '{la.name}' is on day {la.day_number} "
                f"which is outside the {prefs.num_days}-day trip — skipped."
            )
            continue
        if la.start_time:
            h, m = map(int, la.start_time.split(":"))
            start_min = h * 60 + m
        else:
            start_min = cursors[la.day_number]
        end_min = start_min + la.duration_minutes

        result.activities.append(ActivitySlot(
            name=la.name,
            category=la.category,
            location=la.location,
            duration_minutes=la.duration_minutes,
            cost_minor=la.cost_minor,
            opening_hours=la.opening_hours,
            booking_required=la.booking_required,
            recommendation_reason=la.recommendation_reason or "[Locked by user]",
            day_number=la.day_number,
            start_time=_minutes_to_hhmm(start_min),
            end_time=_minutes_to_hhmm(end_min),
            existing_id=la.id,
            is_locked=True,
        ))
        cursors[la.day_number] = end_min + TRAVEL_BUFFER
        used_names.add(la.name.lower())

    budget_cap = prefs.budget_minor   # 0 = uncapped
    remaining = budget_cap - total_cost if budget_cap > 0 else math.inf
    max_per_day = _max_activities_per_day(prefs.travel_pace)

    # ── 2. Filter available candidate pool ───────────────────────────────────
    available_candidates = [
        a for a in raw_candidates
        if a["name"].lower() not in used_names
        and not _is_avoided(a, prefs.avoid)
    ]

    rejected_for_budget: set[str] = set()

    # ── 3. Day-by-day placement with anti-greedy reservation, geographic clustering & variety
    for day in range(1, prefs.num_days + 1):
        days_remaining = prefs.num_days - day + 1
        day_locked_count = sum(1 for a in result.activities if a.day_number == day and a.is_locked)
        placed_today: list[str] = [
            a.name.lower() for a in result.activities if a.day_number == day
        ]

        # Calculate eligible candidates remaining for this trip
        eligible_for_trip = [
            c for c in available_candidates
            if c["name"].lower() not in used_names
            and not _is_avoided(c, prefs.avoid)
        ]
        affordable_candidates = [
            c for c in eligible_for_trip
            if budget_cap <= 0 or remaining == math.inf or c["cost_minor"] <= remaining
        ]
        num_affordable = len(affordable_candidates)

        # Anti-greedy reservation: prevent early days from exhausting the candidate pool
        if num_affordable == 0 and day_locked_count == 0:
            target_slots = 0
        else:
            fair_share = math.ceil(num_affordable / days_remaining) if days_remaining > 0 else num_affordable
            target_slots = min(max_per_day, fair_share)
            if num_affordable >= days_remaining:
                # Reserve at least 1 candidate for each future day
                reserve_limit = num_affordable - (days_remaining - 1)
                target_slots = min(target_slots, reserve_limit)
            target_slots = max(1 if num_affordable > 0 else 0, target_slots)

        slots_left = max(0, target_slots - day_locked_count)

        # Determine day's weather characteristics if forecast is available
        weather_info = weather_days[day - 1] if day - 1 < len(weather_days) else None
        is_rainy_day = False
        if weather_info:
            prob = weather_info.get("precipitation_probability_max") or 0
            code = weather_info.get("weather_code")
            # WMO rain codes: 51..67, 80..82, 95..99
            if prob >= 50 or (code is not None and code in (51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99)):
                is_rainy_day = True

        day_part_order = ["morning", "afternoon", "evening"]
        max_per_window = max(1, math.ceil(max_per_day / 3))

        for day_part in day_part_order:
            if slots_left <= 0:
                break
            window_placed = 0

            # Re-score candidates dynamically for this day and day_part
            def _dynamic_day_score(cand: dict) -> float:
                base = _score(cand, prefs.travel_styles, remaining, prefs.travel_pace)
                is_indoor = cand.get("is_indoor", False)
                cand_cat = cand.get("category", "").lower()
                cand_loc = (cand.get("location") or "").lower()

                # 1. Weather adaptability
                if is_rainy_day:
                    if is_indoor or cand_cat in ("culture", "museum", "shopping", "food"):
                        base += 0.40
                    else:
                        base -= 0.50

                # 2. Meal-time dining boost
                if cand_cat == "food" and day_part in ("afternoon", "evening"):
                    base += 0.25

                # 3. Category variety: reward diversity across heritage, food, shopping, nature
                day_cats = [a.category.lower() for a in result.activities if a.day_number == day]
                if cand_cat in day_cats:
                    base -= 0.20
                else:
                    base += 0.15

                # 4. Geographic clustering: group nearby attractions on the same day
                day_locs = [a.location.lower() for a in result.activities if a.day_number == day and a.location]
                if cand_loc and day_locs:
                    cand_tokens = set(re.findall(r"\b[a-z]{4,}\b", cand_loc))
                    for d_loc in day_locs:
                        d_tokens = set(re.findall(r"\b[a-z]{4,}\b", d_loc))
                        common = cand_tokens.intersection(d_tokens)
                        meaningful = common - {"road", "street", "avenue", "city", "park", "district", "square", "near"}
                        if meaningful:
                            base += 0.35
                            break

                return base

            available_candidates.sort(key=_dynamic_day_score, reverse=True)

            for cand in available_candidates:
                if slots_left <= 0 or window_placed >= max_per_window:
                    break
                cand_name_lower = cand["name"].lower()
                # STRICT CROSS-DAY DEDUPLICATION: Never repeat an activity across days!
                if cand_name_lower in used_names or cand_name_lower in placed_today:
                    continue
                if cand["day_part"] not in (day_part, "anytime"):
                    continue

                # Budget check
                cost = cand["cost_minor"]
                if budget_cap > 0 and remaining != math.inf and cost > remaining:
                    if cand_name_lower not in rejected_for_budget:
                        rejected_for_budget.add(cand_name_lower)
                        result.warnings.append(
                            f"Skipped '{cand['name']}' ({_format_currency(cost, prefs.currency)}) — insufficient remaining budget."
                        )
                    continue

                # Time placement
                cursor = cursors[day]
                start = _start_of_day_part(day_part, cursor)
                if not _fits_in_day(start, cand["duration_minutes"], day_part):
                    continue

                end = start + cand["duration_minutes"]
                reason = cand.get("recommendation_reason") or ""
                if is_rainy_day and (cand.get("is_indoor") or cand.get("category") in ("culture", "museum", "shopping")):
                    reason = f"[Weather-Adapted] Scheduled indoor experience for forecast rain. {reason}".strip()

                result.activities.append(ActivitySlot(
                    name=cand["name"],
                    category=cand["category"],
                    location=cand["location"],
                    duration_minutes=cand["duration_minutes"],
                    cost_minor=cost,
                    opening_hours=cand.get("opening_hours"),
                    booking_required=cand.get("booking_required", False),
                    recommendation_reason=reason,
                    day_number=day,
                    start_time=_minutes_to_hhmm(start),
                    end_time=_minutes_to_hhmm(end),
                    source=cand.get("source", "curated"),
                    is_demo=cand.get("is_demo", False),
                    is_verified=cand.get("is_verified", True),
                ))
                cursor = end + TRAVEL_BUFFER
                cursors[day] = cursor
                placed_today.append(cand_name_lower)
                used_names.add(cand_name_lower)
                total_cost += cost
                if remaining != math.inf:
                    remaining -= cost
                slots_left -= 1
                window_placed += 1

        # Guarantee coverage for this day: if day has 0 activities, find alternatives or complimentary exploration
        day_acts = [a for a in result.activities if a.day_number == day]
        if not day_acts and target_slots > 0:
            # Try to place any remaining candidate regardless of day_part that fits in remaining budget
            cursor = cursors[day]
            for cand in available_candidates:
                cand_name_lower = cand["name"].lower()
                if cand_name_lower in used_names:
                    continue
                cost = cand["cost_minor"]
                if budget_cap > 0 and remaining != math.inf and cost > remaining:
                    continue
                start = max(DAY_START_MINUTES, cursor)
                if start + cand["duration_minutes"] > DAY_END_MINUTES:
                    continue
                end = start + cand["duration_minutes"]
                result.activities.append(ActivitySlot(
                    name=cand["name"],
                    category=cand["category"],
                    location=cand["location"],
                    duration_minutes=cand["duration_minutes"],
                    cost_minor=cost,
                    opening_hours=cand.get("opening_hours"),
                    booking_required=cand.get("booking_required", False),
                    recommendation_reason=cand.get("recommendation_reason") or f"Day {day} exploration in {cand['location']}",
                    day_number=day,
                    start_time=_minutes_to_hhmm(start),
                    end_time=_minutes_to_hhmm(end),
                    source=cand.get("source", "curated"),
                    is_demo=cand.get("is_demo", False),
                    is_verified=cand.get("is_verified", True),
                ))
                used_names.add(cand_name_lower)
                cursor = end + TRAVEL_BUFFER
                cursors[day] = cursor
                total_cost += cost
                if remaining != math.inf:
                    remaining -= cost
                if len([a for a in result.activities if a.day_number == day]) >= max(1, target_slots):
                    break

    # ── 4. Construct complete day records for EVERY calendar day ─────────────
    day_dates = _calculate_day_dates(prefs.departure_date, prefs.num_days)
    for day in range(1, prefs.num_days + 1):
        day_acts = [a for a in result.activities if a.day_number == day]
        date_str = day_dates[day - 1]
        if not day_acts:
            if budget_cap > 0 and remaining <= 0:
                day_status = "unfilled"
                unfilled_reason = "Insufficient remaining budget for further activities"
            else:
                day_status = "unfilled"
                unfilled_reason = "No further verified destination places available"
            result.days.append(DayPlan(
                day_number=day,
                date=date_str,
                theme=f"Day {day}: Free Exploration in {prefs.destination.split(',')[0].strip()}",
                status=day_status,
                unfilled_reason=unfilled_reason,
                activities=[],
            ))
            result.warnings.append(
                f"Day {day} ({date_str}): Unfilled — {unfilled_reason}."
            )
        else:
            day_status = "scheduled" if len(day_acts) >= min(2, max_per_day) else "partial"
            day_theme = _default_day_theme(day, day_acts, prefs.destination)
            result.days.append(DayPlan(
                day_number=day,
                date=date_str,
                theme=day_theme,
                status=day_status,
                unfilled_reason=None,
                activities=day_acts,
            ))

    result.calendar_complete = (len(result.days) == prefs.num_days)
    has_demo = any(
        getattr(a, "is_demo", False)
        or "[DEMO]" in (a.recommendation_reason or "")
        or "[Destination-Adapted]" in (a.recommendation_reason or "")
        for a in result.activities
    )
    result.schedule_complete = (
        len(result.days) == prefs.num_days
        and all(d.status == "scheduled" for d in result.days)
        and all(len(d.activities) >= 1 for d in result.days)
        and not has_demo
        and bool(result.activities)
    )

    # ── 4. Budget breakdown ───────────────────────────────────────────────────
    by_cat: dict[str, int] = {}
    for slot in result.activities:
        by_cat[slot.category] = by_cat.get(slot.category, 0) + slot.cost_minor

    over = max(0, total_cost - budget_cap) if budget_cap > 0 else 0
    result.budget = BudgetBreakdown(
        by_category=by_cat,
        total_minor=total_cost,
        budget_cap_minor=budget_cap,
        over_budget=over > 0,
        over_budget_by_minor=over,
    )

    # ── 5. Warnings ───────────────────────────────────────────────────────────
    if result.budget.over_budget:
        result.warnings.append(
            f"Estimated spend ({_format_currency(total_cost, prefs.currency)}) exceeds the budget "
            f"cap of {_format_currency(budget_cap, prefs.currency)} by {_format_currency(over, prefs.currency)}. "
            "Consider removing optional activities or increasing the budget."
        )

    if not result.activities:
        result.warnings.append(
            "No activities could be scheduled. "
            "Check that the destination has catalogue data and the budget is sufficient."
        )

    # Sort final list chronologically
    result.activities.sort(key=lambda a: (a.day_number, a.start_time))
    return result


# ---------------------------------------------------------------------------
# Overlap validator (used by tests and the API)
# ---------------------------------------------------------------------------

def validate_schedule(slots: list[ActivitySlot]) -> list[str]:
    """
    Detect time overlaps in a schedule.

    Returns a list of warning strings (empty list = no problems found).
    """
    warnings: list[str] = []
    by_day: dict[int, list[ActivitySlot]] = {}
    for s in slots:
        by_day.setdefault(s.day_number, []).append(s)

    for day, day_slots in by_day.items():
        sorted_slots = sorted(day_slots, key=lambda x: x.start_time)
        for i in range(len(sorted_slots) - 1):
            a, b = sorted_slots[i], sorted_slots[i + 1]
            # Compare as HH:MM strings — lexicographic comparison works here
            if b.start_time < a.end_time:
                warnings.append(
                    f"Day {day}: '{a.name}' (ends {a.end_time}) overlaps with "
                    f"'{b.name}' (starts {b.start_time})."
                )
    return warnings
