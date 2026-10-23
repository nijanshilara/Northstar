"""
plan_b_engine.py
────────────────
Replanning engine for the AI Travel Guide.

When a user reports a disruption (delay, closure, cancellation) for a
specific activity, this engine:

1.  Removes the disrupted activity (unless it is locked — then warns).
2.  Identifies the gap created on that day.
3.  Attempts to fill the gap with suitable alternatives from the catalogue.
4.  Returns a ReplannedResult with the updated schedule and a plain-language
    explanation of each change made.

Constraints
───────────
- Locked activities are never removed; the engine warns the user instead.
- Activities on *other* days are never touched.
- The engine is pure-Python (no DB access) — the API layer persists results.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.algorithms.activity_catalogue import get_catalogue
from app.algorithms.schedule_builder import (
    ActivitySlot, TripPreferences, ScheduleResult, BudgetBreakdown,
    DAY_START_MINUTES, DAY_END_MINUTES, TRAVEL_BUFFER,
    _minutes_to_hhmm, _fits_in_day, _start_of_day_part,
    _score, _max_activities_per_day, _is_avoided,
)


# ---------------------------------------------------------------------------
# Disruption descriptor
# ---------------------------------------------------------------------------

@dataclass
class Disruption:
    """Describes what went wrong."""
    activity_name: str               # name of the disrupted activity
    day_number: int
    reason: str = "closure"          # "closure" | "delay" | "cancellation"
    delay_minutes: int = 0           # only meaningful for reason="delay"


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

@dataclass
class ReplannedResult:
    activities: list[ActivitySlot] = field(default_factory=list)
    budget: BudgetBreakdown = field(default_factory=BudgetBreakdown)
    changes: list[str] = field(default_factory=list)   # plain-English changes
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Core replanning logic
# ---------------------------------------------------------------------------

def _hhmm_to_minutes(t: str) -> int:
    h, m = map(int, t.split(":"))
    return h * 60 + m


def replan(
    prefs: TripPreferences,
    current_schedule: list[ActivitySlot],
    disruption: Disruption,
) -> ReplannedResult:
    """
    Replan around a disruption.

    Parameters
    ──────────
    prefs            : Original trip preferences (for style scoring etc.)
    current_schedule : The full current schedule (all days).
    disruption       : The event being disrupted.

    Returns
    ───────
    ReplannedResult with updated activity list, changes, and warnings.
    """
    result = ReplannedResult()

    # Separate disrupted day from others
    target_day = disruption.day_number
    other_days = [a for a in current_schedule if a.day_number != target_day]
    disrupted_day = [a for a in current_schedule if a.day_number == target_day]

    # Find the disrupted activity
    disrupted_slot: Optional[ActivitySlot] = None
    for slot in disrupted_day:
        if slot.name.lower() == disruption.activity_name.lower():
            disrupted_slot = slot
            break

    if disrupted_slot is None:
        result.warnings.append(
            f"Activity '{disruption.activity_name}' not found on day {target_day}. "
            "No changes made."
        )
        result.activities = list(current_schedule)
        return result

    # Refuse to remove a locked activity
    if disrupted_slot.is_locked:
        result.warnings.append(
            f"'{disrupted_slot.name}' is locked and cannot be automatically removed. "
            "Please unlock it first if you wish to replan around it."
        )
        result.activities = list(current_schedule)
        return result

    # ── Handle delay ─────────────────────────────────────────────────────────
    if disruption.reason == "delay" and disruption.delay_minutes > 0:
        new_start = _hhmm_to_minutes(disrupted_slot.start_time) + disruption.delay_minutes
        new_end = new_start + disrupted_slot.duration_minutes
        if new_end <= DAY_END_MINUTES:
            updated_slot = ActivitySlot(
                **{k: v for k, v in disrupted_slot.__dict__.items()},
            )
            updated_slot.start_time = _minutes_to_hhmm(new_start)
            updated_slot.end_time = _minutes_to_hhmm(new_end)

            result.changes.append(
                f"'{disrupted_slot.name}' delayed by {disruption.delay_minutes} min → "
                f"now {updated_slot.start_time}–{updated_slot.end_time}."
            )
            # Rebuild day with the shifted activity
            new_day = [a for a in disrupted_day if a.name != disrupted_slot.name] + [updated_slot]
            new_day.sort(key=lambda a: a.start_time)

            # Check cascading overlaps for the rest of that day
            _fix_cascades(new_day, result)

            result.activities = other_days + new_day
            result.activities.sort(key=lambda a: (a.day_number, a.start_time))
            _rebuild_budget(result, prefs)
            return result
        else:
            result.warnings.append(
                f"'{disrupted_slot.name}' delayed by {disruption.delay_minutes} min would "
                f"push past midnight — treating as closure."
            )

    # ── Handle closure / cancellation ────────────────────────────────────────
    result.changes.append(
        f"'{disrupted_slot.name}' removed from day {target_day} ({disruption.reason})."
    )

    # Gap available on that day
    gap_start = _hhmm_to_minutes(disrupted_slot.start_time)
    gap_end   = gap_start + disrupted_slot.duration_minutes + TRAVEL_BUFFER
    available_minutes = gap_end - gap_start - TRAVEL_BUFFER

    # Existing names (to avoid re-adding the same or any already-scheduled activity)
    used_names = {a.name.lower() for a in current_schedule}
    # Keep the disrupted activity in used_names so it cannot be chosen as its own replacement

    # Try to fill the gap with a catalogue alternative
    catalogue = get_catalogue(prefs.destination)
    budget_used = sum(a.cost_minor for a in other_days) + sum(
        a.cost_minor for a in disrupted_day if a.name != disrupted_slot.name
    )
    remaining = (prefs.budget_minor - budget_used) if prefs.budget_minor > 0 else float("inf")

    candidates = [
        c for c in catalogue
        if c["name"].lower() not in used_names
        and not _is_avoided(c, prefs.avoid)
        and c["duration_minutes"] <= available_minutes
        and (prefs.budget_minor == 0 or c["cost_minor"] <= remaining)
    ]
    candidates.sort(
        key=lambda c: _score(c, prefs.travel_styles, remaining, prefs.travel_pace),
        reverse=True,
    )

    rebuilt_day = [a for a in disrupted_day if a.name != disrupted_slot.name]

    if candidates:
        best = candidates[0]
        day_part = best["day_part"]
        start = _start_of_day_part(day_part, gap_start)
        if start + best["duration_minutes"] <= DAY_END_MINUTES:
            end = start + best["duration_minutes"]
            replacement = ActivitySlot(
                name=best["name"],
                category=best["category"],
                location=best["location"],
                duration_minutes=best["duration_minutes"],
                cost_minor=best["cost_minor"],
                opening_hours=best["opening_hours"],
                booking_required=best["booking_required"],
                recommendation_reason=best["recommendation_reason"],
                day_number=target_day,
                start_time=_minutes_to_hhmm(start),
                end_time=_minutes_to_hhmm(end),
            )
            rebuilt_day.append(replacement)
            result.changes.append(
                f"Added '{best['name']}' at {replacement.start_time}–{replacement.end_time} "
                f"as a replacement on day {target_day}."
            )
    else:
        result.warnings.append(
            f"No suitable replacement found for '{disrupted_slot.name}' on day {target_day}. "
            "The time slot will be left free."
        )

    rebuilt_day.sort(key=lambda a: a.start_time)
    result.activities = other_days + rebuilt_day
    result.activities.sort(key=lambda a: (a.day_number, a.start_time))
    _rebuild_budget(result, prefs)
    return result


def _fix_cascades(day_slots: list[ActivitySlot], result: ReplannedResult) -> None:
    """Push activities forward to eliminate overlaps created by a delay."""
    day_slots.sort(key=lambda a: a.start_time)
    for i in range(1, len(day_slots)):
        prev = day_slots[i - 1]
        curr = day_slots[i]
        prev_end = _hhmm_to_minutes(prev.end_time)
        curr_start = _hhmm_to_minutes(curr.start_time)
        if curr_start < prev_end + TRAVEL_BUFFER:
            new_start = prev_end + TRAVEL_BUFFER
            new_end = new_start + curr.duration_minutes
            if new_end > DAY_END_MINUTES:
                result.warnings.append(
                    f"'{curr.name}' could not be rescheduled after the delay "
                    f"(would end at {_minutes_to_hhmm(new_end)}). Removed."
                )
                day_slots.pop(i)
                return _fix_cascades(day_slots, result)
            result.changes.append(
                f"'{curr.name}' shifted to {_minutes_to_hhmm(new_start)}–"
                f"{_minutes_to_hhmm(new_end)} to avoid overlap."
            )
            curr.start_time = _minutes_to_hhmm(new_start)
            curr.end_time = _minutes_to_hhmm(new_end)


def _rebuild_budget(result: ReplannedResult, prefs: TripPreferences) -> None:
    by_cat: dict[str, int] = {}
    total = 0
    for a in result.activities:
        by_cat[a.category] = by_cat.get(a.category, 0) + a.cost_minor
        total += a.cost_minor
    cap = prefs.budget_minor
    over = max(0, total - cap) if cap > 0 else 0
    result.budget = BudgetBreakdown(
        by_category=by_cat,
        total_minor=total,
        budget_cap_minor=cap,
        over_budget=over > 0,
        over_budget_by_minor=over,
    )
