"""
itinerary_planner.py — Destination-Aware Two-Stage Smart Itinerary Planning Service.

Architecture:
- Stage A: Gather and validate destination-specific candidate places (via PlacesProvider)
  and destination weather forecast (via Open-Meteo).
- Stage B: Ask AI provider to assemble a coherent, diverse, weather-adapted day-by-day itinerary.
  If AI is unconfigured or fails, seamlessly fall back to our deterministic schedule engine.
- Validation:
  - Strict deduplication across days (no repeated attractions or venues).
  - Chronological time slots (start < end, no overlaps, travel buffers).
  - Weather alignment (indoor alternatives on rainy forecast days).
  - Preservation of user-locked activities.
  - Budget cap calculation and warnings.
  - Honest attribution (is_ai=True only when live AI actually generated the plan).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Optional, List, Dict, Any

from app.models.base import Trip, Activity
from app.algorithms.schedule_builder import (
    TripPreferences, LockedActivity, ActivitySlot, BudgetBreakdown,
    ScheduleResult, build_schedule, validate_schedule, _minutes_to_hhmm, _format_currency,
)
from app.integrations.places import get_places_provider, PlaceCandidate
from app.integrations.weather import fetch_forecast
from app.integrations.ai_provider import ai_is_live, generate_text, ai_provider_name

logger = logging.getLogger(__name__)


def _extract_json_block(text: str) -> Optional[dict]:
    """Extract and parse JSON object from markdown code fences or raw string."""
    if not text:
        return None
    # 1. Check for markdown code fences ```json ... ```
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass

    # 2. Try raw substring from first '{' to last '}'
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        raw_json = text[first_brace:last_brace + 1]
        try:
            return json.loads(raw_json)
        except Exception:
            pass

    return None


async def plan_destination_itinerary(
    trip: Trip,
    locked_activities: list[LockedActivity],
    use_ai: bool = True,
) -> ScheduleResult:
    """
    Destination-aware itinerary planning.

    Architecture:
    1. Resolve destination-specific candidate places via PlacesProvider.
    2. Retrieve weather forecast (non-blocking).
    3. Run deterministic Python schedule builder FIRST:
       - 100% calendar coverage for all trip dates (DayPlan for every date).
       - Enforces budget limits, deduplication, locked activities, and time constraints.
       - If suitable activities cannot be found, marks day as unfilled with reason; NEVER invents attractions.
    4. Optional Bounded AI Enhancement (timeout <= 3.5s):
       - If AI is configured and requested, optionally polishes daily themes and recommendation notes.
       - Gemini NEVER creates or alters days, dates, or places.
       - If AI times out or is offline, baseline is returned immediately without waiting.
    """
    prefs = TripPreferences.from_trip(trip)
    warnings: list[str] = []

    # ── STAGE 1: Places Provider ──────────────────────────────────────────────
    places_provider = get_places_provider()
    candidate_limit = max(35, prefs.num_days * 5)
    try:
        candidates: list[PlaceCandidate] = await asyncio.wait_for(
            places_provider.search_places(destination=trip.destination, limit=candidate_limit),
            timeout=10.0,
        )
    except Exception as exc:
        logger.warning("Places search timed out or failed: %s", exc)
        candidates = []

    if not candidates:
        warnings.append(
            f"No verified destination places found for '{trip.destination}'. "
            "Calendar days generated with explicit unfilled status."
        )

    # ── STAGE 2: Weather Integration (bounded non-blocking) ───────────────────
    weather_days: list[dict] = []
    try:
        w_data = await asyncio.wait_for(
            fetch_forecast(city=trip.destination),
            timeout=3.0,
        )
        if w_data and not w_data.get("error") and w_data.get("days"):
            weather_days = w_data["days"]
    except Exception as exc:
        logger.debug("Weather fetch skipped during itinerary planning: %s", exc)

    # ── STAGE 3: Deterministic Python Schedule Engine ─────────────────────────
    # Deterministic engine owns the calendar structure, days, activities, and budget
    schedule_res = build_schedule(
        prefs=prefs,
        locked=locked_activities,
        weather_days=weather_days,
        candidate_places=candidates,
    )
    schedule_res.warnings.extend(warnings)

    # ── STAGE 4: Optional Bounded AI Polish (themes & descriptions) ───────────
    ai_enhanced = False
    ai_unavailable_reason = None

    if use_ai and ai_is_live():
        try:
            ai_enhanced = await _enhance_with_ai(trip=trip, prefs=prefs, schedule=schedule_res)
            if not ai_enhanced:
                ai_unavailable_reason = "AI response was non-JSON or incomplete; deterministic baseline preserved."
        except asyncio.TimeoutError:
            logger.info("AI theme enhancement timed out (3.5s); returning verified deterministic baseline.")
            ai_unavailable_reason = "AI enhancement exceeded deadline (3.5s); verified deterministic schedule preserved."
            schedule_res.warnings.append(
                "AI enhancement exceeded deadline (3.5s); schedule generated deterministically using verified destination places."
            )
        except Exception as exc:
            logger.warning("AI enhancement error: %s; returning baseline.", exc)
            ai_unavailable_reason = f"AI enhancement unavailable ({exc}); verified deterministic schedule preserved."
            schedule_res.warnings.append(
                "AI enhancement was unavailable; schedule generated deterministically using verified destination places."
            )
    else:
        if not use_ai:
            ai_unavailable_reason = "AI enhancement not requested; generated via deterministic destination engine."
        else:
            ai_unavailable_reason = "AI service offline; generated via deterministic destination engine."

    schedule_res.ai_enhanced = ai_enhanced
    schedule_res.ai_unavailable_reason = ai_unavailable_reason
    schedule_res.is_demo = not ai_is_live()

    return schedule_res


async def _enhance_with_ai(
    trip: Trip,
    prefs: TripPreferences,
    schedule: ScheduleResult,
) -> bool:
    """
    Call Gemini with a bounded timeout (3.5s) to polish themes and descriptions
    for an already deterministically validated schedule.
    Returns True if enhanced, False otherwise.
    """
    days_summary = []
    for day_plan in schedule.days:
        acts = [f"{a.name} ({a.category}, {a.start_time}–{a.end_time})" for a in day_plan.activities]
        acts_str = "; ".join(acts) if acts else "Free day (no scheduled activities)"
        days_summary.append(f"Day {day_plan.day_number} ({day_plan.date}): {acts_str}")

    prompt = (
        f"Trip Destination: {trip.destination}\n"
        f"Trip Duration: {prefs.num_days} days\n"
        f"Scheduled Plan:\n" + "\n".join(days_summary) + "\n\n"
        "Provide inspiring, destination-specific daily themes and concise recommendation reasons for the scheduled activities.\n"
        "Return ONLY a JSON object with this schema:\n"
        "{\n"
        '  "themes": { "1": "Theme for Day 1", "2": "Theme for Day 2" },\n'
        '  "notes": { "<Activity Name>": "Personalized 1-sentence tip" }\n'
        "}"
    )
    system = "You are Northstar's AI travel editor. Refine theme titles and activity tips. Return pure JSON."
    resp = await asyncio.wait_for(
        generate_text(prompt=prompt, system=system, max_tokens=1000, temperature=0.3),
        timeout=3.5,
    )
    if not resp or not resp.get("text"):
        return False

    parsed = _extract_json_block(resp["text"])
    if not parsed:
        return False

    # Format 1: Direct themes & notes schema
    themes = parsed.get("themes", {})
    notes = parsed.get("notes", {})

    if isinstance(themes, dict):
        for day_plan in schedule.days:
            t = themes.get(str(day_plan.day_number)) or themes.get(day_plan.day_number)
            if t and isinstance(t, str) and t.strip():
                day_plan.theme = t.strip()

    if isinstance(notes, dict):
        for act in schedule.activities:
            note = notes.get(act.name)
            if note and isinstance(note, str) and note.strip():
                act.recommendation_reason = note.strip()

    # Format 2: Day records schema (extract themes, reasons, and detect missing synthesized days)
    ai_days = parsed.get("days")
    if isinstance(ai_days, list) and ai_days:
        ai_day_nums = {d.get("day_number") for d in ai_days if isinstance(d, dict) and d.get("day_number")}
        all_day_nums = set(range(1, prefs.num_days + 1))
        missing_days = sorted(list(all_day_nums - ai_day_nums))
        if missing_days:
            missing_str = ", ".join(f"Day {d}" for d in missing_days)
            schedule.warnings.append(f"{missing_str} were synthesized from verified destination candidates.")

        for d in ai_days:
            if isinstance(d, dict):
                d_num = d.get("day_number")
                d_theme = d.get("theme")
                if d_num and d_theme:
                    for dp in schedule.days:
                        if dp.day_number == d_num:
                            dp.theme = d_theme
                for a in d.get("activities", []):
                    if isinstance(a, dict) and a.get("name") and a.get("reason"):
                        for act in schedule.activities:
                            if a["name"].lower() in act.name.lower():
                                act.recommendation_reason = a["reason"]

    return True
