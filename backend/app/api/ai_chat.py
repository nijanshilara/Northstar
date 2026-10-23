"""
ai_chat.py — AI Assistant API router.

POST /api/ai/chat
    Send a user message and receive an AI response.
    Requires GEMINI_API_KEY or OPENAI_API_KEY in backend/.env.
    Falls back gracefully if no key is configured.

POST /api/ai/enrich-itinerary
    Ask the AI to suggest improvements to an existing itinerary.
    Returns suggestions as structured text (not persisted automatically).

GET /api/ai/status
    Returns whether a real AI provider is configured.
"""

from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.base import Activity, Trip, ExpenseGroup
from app.models.user import User
from app.api.auth import get_current_user_optional
from app.integrations.ai_provider import (
    generate_text,
    ai_provider_name,
    ai_is_live,
    get_ai_status_info,
)
from app.integrations.weather import fetch_forecast

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000, description="User's message")
    context: str = Field(
        default="",
        max_length=2000,
        description="Optional: trip context (destination, dates, budget) to include"
    )


class ChatResponse(BaseModel):
    reply: str
    is_ai: bool
    provider: str
    model: str | None = None
    is_fallback: bool = False
    is_complete: bool = True
    finish_reason: str = "stop"
    error: str | None = None


class EnrichRequest(BaseModel):
    trip_id: int
    focus: str = Field(
        default="general",
        description="What to focus on: 'budget', 'food', 'culture', 'adventure', 'general'"
    )


class EnrichResponse(BaseModel):
    suggestions: str
    is_ai: bool
    provider: str
    error: str | None = None


class AIStatusResponse(BaseModel):
    is_live: bool
    provider: str
    message: str
    configured_model: str = ""
    active_model: str = ""
    is_fallback: bool = False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/status", response_model=AIStatusResponse, summary="Check AI provider status")
async def ai_status():
    """Returns whether a real AI provider is configured and which one."""
    info = get_ai_status_info()
    live = info["is_live"]
    provider = info["provider"]
    return AIStatusResponse(
        is_live=live,
        provider=provider,
        configured_model=info.get("configured_model", ""),
        active_model=info.get("active_model", ""),
        is_fallback=info.get("is_fallback", False),
        message=(
            f"AI powered by {provider}."
            if live else
            "No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY in backend/.env "
            "to enable real AI responses."
        ),
    )


@router.post("/chat", response_model=ChatResponse, summary="Chat with the AI travel assistant")
async def ai_chat(payload: ChatRequest):
    """
    Send a travel question to the AI assistant.

    The response includes `is_ai: true` only when a real provider was used.
    When no API key is configured, `is_ai: false` and `error` explain the situation.
    Secrets and API keys are never passed to the frontend.
    """
    system = (
        "You are an expert AI travel planning assistant for Northstar — Your compass to everywhere. "
        "Provide direct, high-value, well-structured travel advice. "
        "When answering travel destination or itinerary questions:\n"
        "- Address the user's specific query immediately.\n"
        "- Cover key highlights: top beaches/nature, cultural/heritage sites, food & dining, local markets, and nightlife where relevant.\n"
        "- Include practical considerations: weather, seasonal expectations, logistics, and sensible safety caveats.\n"
        "- Highlight regional nuances (such as North vs South Goa, or neighborhood distinctions) when relevant.\n"
        "- Organize responses with clean Markdown headers, bullet points, and bold text for easy scanning.\n"
        "Keep answers complete yet focused and readable. "
        "Do not invent unverified real-time rates, confirmed bookings, or live hours."
    )

    full_prompt = payload.message
    if payload.context:
        full_prompt = f"Trip context: {payload.context}\n\nUser question: {payload.message}"

    result = await generate_text(full_prompt, system=system, max_tokens=4096)
    return ChatResponse(
        reply=result["text"],
        is_ai=result["is_ai"],
        provider=result["provider"],
        model=result.get("model"),
        is_fallback=result.get("is_fallback", False),
        is_complete=result.get("is_complete", True),
        finish_reason=result.get("finish_reason", "stop"),
        error=result.get("error"),
    )


@router.post(
    "/enrich-itinerary",
    response_model=EnrichResponse,
    summary="Get AI suggestions to improve an existing itinerary",
)
async def enrich_itinerary(
    payload: EnrichRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Ask the AI for improvement suggestions for a saved trip itinerary.
    The suggestions are returned as text and NOT automatically saved —
    the user chooses what to apply.
    """
    trip: Trip | None = db.query(Trip).filter(Trip.id == payload.trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail=f"Trip {payload.trip_id} not found")

    if trip.user_id is not None and not trip.is_demo:
        if not current_user or current_user.id != trip.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view or enrich this trip",
            )

    activities = (
        db.query(Activity)
        .filter(Activity.trip_id == payload.trip_id)
        .order_by(Activity.day_number, Activity.start_time)
        .all()
    )

    # Build a compact schedule summary for the AI
    schedule_lines = []
    for a in activities:
        schedule_lines.append(
            f"  Day {a.day_number} | {a.start_time or '?'}–{a.end_time or '?'} | "
            f"{a.name} ({a.category.value}) | "
            f"{'LOCKED ' if a.is_locked else ''}"
            f"Cost: {a.cost_minor / 100:.0f} {a.currency}"
        )

    schedule_text = "\n".join(schedule_lines) if schedule_lines else "  (no activities yet)"
    
    # Financial calculations
    budget_cap_minor = trip.budget_minor or 0
    budget_major = budget_cap_minor / 100
    planned_total_minor = sum(a.cost_minor for a in activities)
    planned_major = planned_total_minor / 100

    actual_spent_minor = 0
    groups = db.query(ExpenseGroup).filter(ExpenseGroup.trip_id == payload.trip_id).all()
    for g in groups:
        for exp in g.expenses:
            actual_spent_minor += exp.amount_minor
    actual_major = actual_spent_minor / 100

    remaining_planned_major = max(0, budget_cap_minor - planned_total_minor) / 100 if budget_cap_minor > 0 else 0
    remaining_actual_major = max(0, budget_cap_minor - actual_spent_minor) / 100 if budget_cap_minor > 0 else 0
    num_days = trip.num_days or 1

    focus_map = {
        "budget": "focus on reducing costs while keeping a great experience",
        "food": "focus on local food, restaurants and food experiences",
        "culture": "focus on cultural sites, history and local traditions",
        "adventure": "focus on outdoor and adventure activities",
        "general": "provide well-rounded improvements",
    }
    focus_instruction = focus_map.get(payload.focus, "provide well-rounded improvements")

    # Retrieve weather forecast context for destination
    weather_summary = "Weather forecast currently unavailable for this destination."
    try:
        w_data = await fetch_forecast(city=trip.destination)
        if w_data and not w_data.get("error") and w_data.get("days"):
            lines = []
            for d in w_data["days"][:min(num_days, len(w_data["days"]))]:
                cond = d.get("condition", "Seasonal weather")
                t_max = d.get("temp_max_c")
                t_min = d.get("temp_min_c")
                prob = d.get("precipitation_probability_max")
                temp_str = f"{t_min}°C to {t_max}°C" if (t_min is not None and t_max is not None) else "Normal range"
                rain_str = f", {prob}% rain probability" if prob is not None else ""
                lines.append(f"  - {d.get('date')}: {cond} ({temp_str}{rain_str})")
            if lines:
                weather_summary = (
                    f"Destination Weather Outlook ({w_data.get('city_name', trip.destination)}):\n"
                    + "\n".join(lines)
                )
    except Exception as exc:
        logger.debug("Weather context fetch skipped for trip %s: %s", payload.trip_id, exc)

    prompt = f"""
I have a {num_days}-day trip to {trip.destination} departing from {trip.origin}.
Financial Breakdown:
- Total Budget Cap: {budget_major:.2f} {trip.currency}
- Estimated Itinerary Costs: {planned_major:.2f} {trip.currency}
- Actual Recorded Expenses: {actual_major:.2f} {trip.currency}
- Remaining Budget After Estimates: {remaining_planned_major:.2f} {trip.currency}
- Remaining Budget After Actual Spend: {remaining_actual_major:.2f} {trip.currency}
Travellers: {trip.num_travellers}.

Weather Context:
{weather_summary}

Current itinerary:
{schedule_text}

Please {focus_instruction}. Suggest specific improvements, alternative activities, 
timing adjustments or missing experiences. Keep suggestions practical and relevant 
to the destination. Note which existing activities (marked LOCKED) cannot be changed.

Rules for AI:
1. Financial accuracy rule: All itinerary activity costs are estimates. Do not claim an itinerary fits within budget unless the available estimates support that conclusion.
2. Weather forecasts: Treat weather numbers strictly as probabilistic forecasts, not absolute certainty. If rain or adverse weather is forecast, you may suggest indoor alternatives (e.g. museums, covered bazaars, indoor cultural centres), but NEVER claim that an activity has already been automatically changed or cancelled unless the itinerary explicitly shows that change.
3. Live alerts: Do not claim that live automatic weather alerts are active.

Format your response with clear day-by-day suggestions.
"""

    system = (
        "You are an expert travel planner. Provide specific, practical itinerary suggestions. "
        "Strictly adhere to the provided financial numbers. Distinguish estimated prices from live bookings. "
        "Distinguish weather forecasts from certainty. Never claim automatic weather rescheduling has occurred. "
        "Do not invent live prices or claim an itinerary is within budget if the estimates exceed the budget cap. "
        "Never fabricate specific prices or claim bookings are confirmed."
    )


    result = await generate_text(prompt, system=system, max_tokens=4096)
    return EnrichResponse(
        suggestions=result["text"],
        is_ai=result["is_ai"],
        provider=result["provider"],
        error=result.get("error"),
    )
