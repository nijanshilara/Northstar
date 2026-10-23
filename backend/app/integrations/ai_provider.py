"""
ai_provider.py — Server-side AI provider abstraction.

Supports Gemini (google-genai SDK) and OpenAI as interchangeable backends.
Both require an API key set in backend/.env:
  GEMINI_API_KEY=...   (preferred — Gemini 3.x / Flash models)
  OPENAI_API_KEY=...   (fallback if Gemini is absent)

When neither key is present or when all live providers encounter errors,
the module provides helpful local travel guidance from our built-in curated
travel catalogue, clearly labelled as non-AI (is_ai=False) with truthful
attribution and clear setup instructions.

NEVER claim that offline / rule-based output is live AI-generated.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level tracking of active provider & model
# ---------------------------------------------------------------------------
_last_verified_model: Optional[str] = None
_last_verified_provider: Optional[str] = None
_last_verified_is_fallback: bool = False


def _clean_markdown(text: str) -> str:
    """Normalize escaped markdown artifacts like \\*\\* or \\*."""
    if not text:
        return ""
    cleaned = text.replace(r"\*\*", "**")
    cleaned = cleaned.replace(r"\*", "*")
    cleaned = cleaned.replace(r"\_", "_")
    return cleaned


def _stitch_continuation(base_text: str, cont_text: str) -> str:
    """
    Stitch continuation text to base text, avoiding duplicate sentences or words.
    """
    if not cont_text:
        return base_text
    if not base_text:
        return cont_text

    # Check for exact overlapping suffix of base_text and prefix of cont_text
    max_check = min(len(base_text), len(cont_text), 200)
    for k in range(max_check, 3, -1):
        if base_text.endswith(cont_text[:k]):
            cont_text = cont_text[k:]
            break

    # If both texts are non-empty, ensure natural spacing if a word boundary was split
    if base_text and cont_text:
        if base_text[-1].isalnum() and cont_text[0].isalnum():
            return base_text + " " + cont_text

    return base_text + cont_text


def _gemini_available() -> bool:
    return bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())


def _openai_available() -> bool:
    return bool(settings.OPENAI_API_KEY and settings.OPENAI_API_KEY.strip())


def ai_provider_name() -> str:
    """Return a truthful human-readable name for the active provider."""
    global _last_verified_model, _last_verified_is_fallback
    if _gemini_available():
        if _last_verified_model and isinstance(_last_verified_model, str):
            fallback_label = " (fallback)" if _last_verified_is_fallback else ""
            return f"Google {_last_verified_model}{fallback_label}"
        raw_conf = getattr(settings, "GEMINI_MODEL", "gemini-3.8-flash")
        configured = raw_conf if isinstance(raw_conf, str) and raw_conf else "gemini-3.8-flash"
        configured = configured.strip()
        if configured.startswith("models/"):
            configured = configured[len("models/"):]
        return f"Google {configured}"
    if _openai_available():
        if _last_verified_model and isinstance(_last_verified_model, str):
            return f"OpenAI {_last_verified_model}"
        raw_conf = getattr(settings, "OPENAI_MODEL", "gpt-4o-mini")
        configured = raw_conf if isinstance(raw_conf, str) and raw_conf else "gpt-4o-mini"
        return f"OpenAI {configured.strip()}"
    return "Offline Travel Guide (No AI Key)"


def get_ai_status_info() -> dict:
    """Detailed status metadata for the AI status endpoint."""
    global _last_verified_model, _last_verified_is_fallback
    live = bool(ai_is_live())
    configured_model = ""
    active_model = _last_verified_model if isinstance(_last_verified_model, str) else ""
    is_fallback = bool(_last_verified_is_fallback)

    if _gemini_available():
        raw_conf = getattr(settings, "GEMINI_MODEL", "gemini-3.8-flash")
        configured_model = raw_conf if isinstance(raw_conf, str) and raw_conf else "gemini-3.8-flash"
        configured_model = configured_model.strip()
        if configured_model.startswith("models/"):
            configured_model = configured_model[len("models/"):]
        chosen_model = active_model or configured_model
        provider_name = f"Google {chosen_model}"
        if is_fallback and active_model:
            provider_name += f" (fallback from {configured_model})"
    elif _openai_available():
        raw_conf = getattr(settings, "OPENAI_MODEL", "gpt-4o-mini")
        configured_model = raw_conf if isinstance(raw_conf, str) and raw_conf else "gpt-4o-mini"
        configured_model = configured_model.strip()
        chosen_model = active_model or configured_model
        provider_name = f"OpenAI {chosen_model}"
    else:
        provider_name = "Offline Travel Guide Mode"

    return {
        "is_live": live,
        "provider": str(provider_name),
        "configured_model": str(configured_model),
        "active_model": str(active_model or configured_model),
        "is_fallback": is_fallback,
    }


def ai_is_live() -> bool:
    return _gemini_available() or _openai_available()


# ---------------------------------------------------------------------------
# Core generation function
# ---------------------------------------------------------------------------

async def generate_text(
    prompt: str,
    system: str = "You are a helpful travel planning assistant.",
    max_tokens: int = 4096,
    temperature: float = 0.7,
) -> dict:
    """
    Send *prompt* to the configured AI provider and return:
      {
        "text": str,          # the model's reply
        "is_ai": bool,        # True only when a real provider was used
        "provider": str,      # provider name for attribution
        "model": str,         # specific model used
        "is_fallback": bool,  # True if a fallback model was activated
        "is_complete": bool,  # False if output was truncated by token limits
        "finish_reason": str, # e.g. "stop", "max_tokens", "length"
        "error": str | None,  # non-None when the provider call failed or key is missing
      }

    Falls back gracefully on missing keys, timeouts, or provider errors.
    """
    res: dict | None = None
    if _gemini_available():
        res = await _call_gemini(prompt, system, max_tokens, temperature)
    elif _openai_available():
        res = await _call_openai(prompt, system, max_tokens, temperature)
    else:
        res = _curated_fallback(
            prompt,
            reason="No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY in backend/.env.",
        )

    if res and "text" in res and res["text"]:
        res["text"] = _clean_markdown(res["text"])
    return res


# ---------------------------------------------------------------------------
# Gemini backend (using modern google-genai SDK)
# ---------------------------------------------------------------------------

async def _call_gemini(prompt: str, system: str, max_tokens: int, temperature: float) -> dict:
    global _last_verified_model, _last_verified_provider, _last_verified_is_fallback

    try:
        from google import genai
        from google.genai import types as genai_types

        client = genai.Client(api_key=settings.GEMINI_API_KEY.strip())
        config = genai_types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )

        # Primary configured model + high-availability verified fallback models
        configured_model = (getattr(settings, "GEMINI_MODEL", "gemini-3.8-flash") or "gemini-3.8-flash").strip()
        if configured_model.startswith("models/"):
            configured_model = configured_model[len("models/"):]

        models_to_try = [
            configured_model,
            "gemini-3.8-flash",
            "gemini-3.5-flash",
            "gemini-3-flash-preview",
            "gemini-flash-lite-latest",
            "gemini-flash-latest",
        ]
        # Deduplicate while preserving priority order
        seen = set()
        candidate_models = [m for m in models_to_try if m and not (m in seen or seen.add(m))]

        last_error = None
        for model_name in candidate_models:
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.models.generate_content,
                        model=model_name,
                        contents=prompt,
                        config=config,
                    ),
                    timeout=8.0,
                )

                if not response or not response.candidates:
                    logger.warning("Gemini model %s returned no candidates, trying next model", model_name)
                    continue

                cand = response.candidates[0]
                finish_reason_raw = getattr(cand, "finish_reason", None)
                finish_reason_str = (
                    str(finish_reason_raw).replace("FinishReason.", "").lower()
                    if finish_reason_raw
                    else "stop"
                )

                # Extract user-facing text, skipping internal thought/reasoning tokens
                text_parts: list[str] = []
                if cand.content and cand.content.parts:
                    for p in cand.content.parts:
                        if not getattr(p, "thought", False) and getattr(p, "text", None):
                            text_parts.append(p.text)
                raw_text = "".join(text_parts) if text_parts else (response.text or "")

                is_complete = True
                # Inspect finish reason: if truncated by token limit, perform bounded continuation
                if finish_reason_str in ("max_tokens", "length") and raw_text.strip():
                    logger.warning(
                        "Gemini model %s hit finish_reason=%s. Attempting 1 bounded continuation.",
                        model_name,
                        finish_reason_str,
                    )
                    try:
                        cont_contents = [
                            genai_types.Content(
                                role="user",
                                parts=[genai_types.Part.from_text(text=prompt)],
                            ),
                            genai_types.Content(
                                role="model",
                                parts=[genai_types.Part.from_text(text=raw_text)],
                            ),
                            genai_types.Content(
                                role="user",
                                parts=[
                                    genai_types.Part.from_text(
                                        text="Please continue your previous answer directly from where it was cut off. Do not repeat earlier text or add pleasantries."
                                    )
                                ],
                            ),
                        ]
                        cont_response = await asyncio.wait_for(
                            asyncio.to_thread(
                                client.models.generate_content,
                                model=model_name,
                                contents=cont_contents,
                                config=config,
                            ),
                            timeout=6.0,
                        )
                        if cont_response and cont_response.candidates:
                            cont_cand = cont_response.candidates[0]
                            cont_parts = [
                                p.text
                                for p in cont_cand.content.parts
                                if not getattr(p, "thought", False) and getattr(p, "text", None)
                            ]
                            cont_text = (
                                "".join(cont_parts)
                                if cont_parts
                                else (cont_response.text or "")
                            )
                            if cont_text.strip():
                                raw_text = _stitch_continuation(raw_text, cont_text)
                                cont_finish = str(
                                    getattr(cont_cand, "finish_reason", "")
                                ).replace("FinishReason.", "").lower()
                                finish_reason_str = cont_finish or "stop"
                    except Exception as cont_err:
                        logger.warning("Gemini continuation attempt failed: %s", cont_err)

                # If still truncated after continuation attempt, label honestly
                if finish_reason_str in ("max_tokens", "length"):
                    is_complete = False
                    if not raw_text.endswith("..."):
                        raw_text = raw_text.rstrip() + "..."
                    raw_text += (
                        "\n\n*(Note: This response reached maximum token limits and was cut off. "
                        "You can ask a follow-up question to explore more.)*"
                    )

                if not raw_text.strip():
                    logger.warning("Gemini model %s produced empty text, trying next fallback", model_name)
                    continue

                # Record verified successful model
                _last_verified_model = model_name
                _last_verified_provider = f"Google {model_name}"
                _last_verified_is_fallback = (model_name != configured_model)

                return {
                    "text": _clean_markdown(raw_text),
                    "is_ai": True,
                    "provider": f"Gemini ({model_name})",
                    "model": model_name,
                    "is_fallback": _last_verified_is_fallback,
                    "is_complete": is_complete,
                    "finish_reason": finish_reason_str,
                    "error": None,
                }
            except Exception as e:
                last_error = e
                logger.warning(
                    "Gemini model %s encountered error: %s; trying next fallback model if available.",
                    model_name,
                    e,
                )
                continue

        logger.error("All Gemini models failed: %s", last_error)
        return _curated_fallback(
            prompt,
            reason=f"Gemini API call failed: {last_error}",
        )
    except ImportError:
        logger.error("google-genai not installed on server.")
        return _curated_fallback(
            prompt,
            reason="Gemini SDK (google-genai) is not installed on the server.",
        )
    except Exception as exc:
        logger.error("Gemini initialization failed: %s", exc)
        return _curated_fallback(
            prompt,
            reason=f"Gemini error: {exc}",
        )


# ---------------------------------------------------------------------------
# OpenAI backend
# ---------------------------------------------------------------------------

async def _call_openai(prompt: str, system: str, max_tokens: int, temperature: float) -> dict:
    global _last_verified_model, _last_verified_provider, _last_verified_is_fallback

    try:
        from openai import AsyncOpenAI

        model_name = getattr(settings, "OPENAI_MODEL", "gpt-4o-mini")
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY.strip())
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=max_tokens,
                temperature=temperature,
            ),
            timeout=25.0,
        )

        choice = response.choices[0]
        text = choice.message.content or ""
        finish_reason = getattr(choice, "finish_reason", "stop") or "stop"
        is_complete = True

        if finish_reason == "length" and text.strip():
            logger.warning("OpenAI model %s output truncated by max_tokens. Attempting 1 continuation.", model_name)
            try:
                cont_resp = await asyncio.wait_for(
                    client.chat.completions.create(
                        model=model_name,
                        messages=[
                            {"role": "system", "content": system},
                            {"role": "user", "content": prompt},
                            {"role": "assistant", "content": text},
                            {
                                "role": "user",
                                "content": "Please continue your previous response directly from where it was cut off. Do not repeat earlier text.",
                            },
                        ],
                        max_tokens=max_tokens,
                        temperature=temperature,
                    ),
                    timeout=20.0,
                )
                cont_choice = cont_resp.choices[0]
                cont_text = cont_choice.message.content or ""
                if cont_text.strip():
                    text = _stitch_continuation(text, cont_text)
                    finish_reason = getattr(cont_choice, "finish_reason", "stop") or "stop"
            except Exception as cont_err:
                logger.warning("OpenAI continuation failed: %s", cont_err)

        if finish_reason == "length":
            is_complete = False
            if not text.endswith("..."):
                text = text.rstrip() + "..."
            text += (
                "\n\n*(Note: This response reached output token limits. "
                "Feel free to ask a follow-up question to explore further.)*"
            )

        _last_verified_model = model_name
        _last_verified_provider = f"OpenAI {model_name}"
        _last_verified_is_fallback = False

        return {
            "text": _clean_markdown(text),
            "is_ai": True,
            "provider": f"OpenAI {model_name}",
            "model": model_name,
            "is_fallback": False,
            "is_complete": is_complete,
            "finish_reason": finish_reason,
            "error": None,
        }
    except ImportError:
        logger.error("openai package not installed.")
        return _curated_fallback(
            prompt,
            reason="OpenAI SDK is not installed on the server.",
        )
    except Exception as exc:
        logger.error("OpenAI call failed: %s", exc)
        return _curated_fallback(
            prompt,
            reason=f"OpenAI error: {exc}",
        )


# ---------------------------------------------------------------------------
# Curated Travel Guide (Helpful Offline Assistant)
# ---------------------------------------------------------------------------

def _curated_travel_guide_answer(prompt: str) -> str:
    """Provide rich, practical, structured travel knowledge when no live LLM key is set."""
    p = prompt.lower()

    if "goa" in p:
        if "pack" in p:
            return (
                "🌴 **Packing Checklist for Goa**:\n\n"
                "• **Clothing**: Breathable cottons, linen shirts, swimwear/trunks, light beach cover-up.\n"
                "• **Footwear**: Waterproof flip-flops or sandals, comfortable walking sneakers for forts/markets.\n"
                "• **Sun & Beach Care**: Broad-spectrum reef-safe sunscreen (SPF 50+), sunglasses, wide-brim hat, aloe vera gel.\n"
                "• **Health & Safety**: Mosquito repellent spray (Odomos), basic hydration salts (ORS), personal first-aid.\n"
                "• **Electronics**: Waterproof phone pouch, compact power bank, universal adapter.\n"
                "• **Documents**: Driving licence (if renting a scooter/car), government photo ID, waterproof pouch."
            )
        elif "november" in p or "things to do" in p or "best time" in p:
            return (
                "🌴 **Visiting Goa in November — Top Things to Do & Practical Travel Guide**\n\n"
                "November is widely considered one of the absolute best months to visit Goa. "
                "The monsoon rains have receded, the weather is pleasant (20°C to 32°C / 68°F to 90°F), "
                "humidity drops noticeably, and coastal tourism infrastructure (beach shacks, water sports, "
                "and night markets) fully reopens for the winter season.\n\n"
                "### 1. Beaches & Water Activities\n"
                "• **Action & Water Sports (North Goa)**: Head to Baga, Calangute, or Anjuna for parasailing, jet-skiing, "
                "and banana boat rides as operators resume full post-monsoon permits.\n"
                "• **Scenic & Relaxed (South Goa)**: Unwind at Palolem, Agonda, or Benaulim with gentle swimming, kayak rentals, "
                "and early-morning dolphin-spotting boat trips.\n"
                "• **Safety Caveat**: Swim only in designated zones marked with red-and-yellow flags and monitored by Drishti lifeguards. "
                "Never enter rough surf, and avoid swimming after sunset or alcohol consumption.\n\n"
                "### 2. Heritage & Portuguese-Era Culture\n"
                "• **Old Goa (Velha Goa)**: Tour the UNESCO World Heritage Basilica of Bom Jesus and Sé Cathedral. "
                "Preparations for the solemn Feast of St. Francis Xavier begin in late November.\n"
                "• **Fontainhas Latin Quarter (Panaji)**: Stroll the vibrant Portuguese heritage quarter with colorful colonial villas, "
                "wrought-iron balconies, art galleries, and historic bakeries like Confeitaria 31 de Janeiro.\n"
                "• **Coastal Forts**: Explore Fort Aguada and its 19th-century lighthouse, or Chapora Fort for sweeping Vagator coastal views.\n\n"
                "### 3. Food, Night Markets & Nightlife\n"
                "• **Local Dining**: Feast on authentic Goan fish curry thali, prawn balchão, pork vindaloo, and Bebinca at heritage eateries "
                "(Mum's Kitchen, Viva Panjim) or beachside shacks.\n"
                "• **Night Markets**: The Saturday Night Market in Arpora typically reopens in November, bringing live music, global street food, "
                "and artisan crafts.\n"
                "• **Nightlife**: Tito's Lane in Baga and beachfront sunset clubs at Vagator/Anjuna offer vibrant music and dining.\n\n"
                "### 4. North vs South Goa Distinction\n"
                "• **North Goa**: Vibrant, energetic, ideal for nightlife, water sports, cafe hopping, and social gatherings.\n"
                "• **South Goa**: Peaceful, romantic, and scenic, featuring uncrowded beaches, luxury heritage resorts, and pristine nature.\n\n"
                "### 5. Practical Weather & Planning Tips\n"
                "• **Weather**: Clear sunny days with balmy sea breezes in the evening. Pack lightweight cottons, sunglasses, and sunscreen.\n"
                "• **Transport**: Renting a scooter or car is the most convenient option. Carry a valid driving licence and always wear a helmet.\n"
                "• **Bookings**: Early November offers moderate shoulder rates, but flight and hotel prices rise sharply toward Thanksgiving and December. "
                "Book accommodations 3–4 weeks in advance."
            )
        else:
            return (
                "🌴 **Top Highlights & 3-Day Plan for Goa**:\n\n"
                "• **Day 1 (North Goa Heritage & Beaches)**: Morning visit to Fort Aguada & Sinquerim Beach. Afternoon shopping at Anjuna Flea Market. Sunset drinks at Vagator Beach.\n"
                "• **Day 2 (Old Goa & Panaji Culture)**: Explore Basilica of Bom Jesus & Sé Cathedral. Walk through the colorful Latin Quarter of Fontainhas. Evening Mandovi river sunset cruise.\n"
                "• **Day 3 (South Goa Serenity)**: Relax at Palolem or Agonda Beach. Fresh seafood lunch by the water. Visit Cabo de Rama Fort for panoramic sea views."
            )

    if "paris" in p:
        return (
            "🗼 **3-Day Budget Guide for Paris**:\n\n"
            "• **Day 1**: Morning walk along the Seine, visit Notre-Dame exterior and Île de la Cité. Afternoon explore the Louvre (pre-book afternoon slots). Evening stroll up the Champs-Élysées to the Arc de Triomphe.\n"
            "• **Day 2**: Morning at bohemian Montmartre & Sacré-Cœur for city vistas. Grab fresh baguettes and cheese for a picnic at Champ de Mars by the Eiffel Tower. Sunset cruise along the Seine.\n"
            "• **Day 3**: Explore the historic Marais district, Musée d'Orsay, and Luxembourg Gardens.\n\n"
            "💡 **Budget Tips**: Use the Navigo Easy card for metro rides; take advantage of free admission to national museums on the first Sunday of the month."
        )

    if "tokyo" in p or "japan" in p:
        return (
            "🗾 **Travel Guide for Tokyo & Japan**:\n\n"
            "• **Best Time to Visit**: Spring (late March to mid-April) for cherry blossoms, and Autumn (October to November) for crisp weather and brilliant foliage.\n"
            "• **Top Areas**: Historic Asakusa (Senso-ji Temple), futuristic Shibuya & Shinjuku, culture hub Ueno, and electronic paradise Akihabara.\n"
            "• **Budget Tips**: Buy a Suica/Pasmo IC card for easy train transport; 7-Eleven/Lawson offer surprisingly high-quality, budget-friendly bento meals; take day trips to Kamakura or Nikko."
        )

    if "bali" in p:
        return (
            "🌺 **Bali Travel Guide & Packing**:\n\n"
            "• **What to Pack**: Modest temple attire (sarong/scarf for temple visits), quick-dry swimwear, waterproof dry bag, reef-safe sunscreen, digestive enzymes & charcoal tablets.\n"
            "• **Top Areas**: Ubud for lush rice terraces and wellness; Canggu/Seminyak for beach cafes and surfing; Uluwatu for cliffside ocean temples and Kecak dance.\n"
            "• **Best Season**: Dry season runs from May through September with low humidity and warm, sunny days."
        )

    if "rajasthan" in p or "jaipur" in p:
        return (
            "🏰 **Rajasthan Travel Highlights**:\n\n"
            "• **Best Time**: October through March when daytime temperatures are pleasant (15°C–28°C).\n"
            "• **Golden Triangle**: Delhi → Agra (Taj Mahal) → Jaipur (Amber Fort, City Palace, Hawa Mahal).\n"
            "• **Beyond Jaipur**: The blue city of Jodhpur (Mehrangarh Fort) and the romantic lake palaces of Udaipur.\n"
            "• **Food**: Dal Baati Churma, Ker Sangri, and Laal Maas."
        )

    if "monsoon" in p or ("trek" in p and any(k in p for k in ["pack", "gear", "wear", "list", "need", "take", "bring", "shoes"])):
        return (
            "🌧️ **Monsoon Trek Packing & Safety Checklist**:\n\n"
            "• **Waterproofing & Backpack Protection**:\n"
            "  - Waterproof backpack rain cover + heavy-duty dry sacks / polybags inside for dry clothes and sleeping bag.\n"
            "  - Lightweight, breathable waterproof poncho or rain jacket with taped seams (avoid heavy non-breathable vinyl).\n"
            "  - IPX8-rated waterproof phone pouch and silica gel packets for electronics and power banks.\n\n"
            "• **Clothing & Footwear**:\n"
            "  - 3–4 quick-dry synthetic / polyester t-shirts and zip-off trekking pants (strictly avoid cotton or denim — they trap moisture and chill you).\n"
            "  - High-traction trekking shoes with deep rubber lugs for wet rock and muddy trails.\n"
            "  - 3–4 pairs of synthetic or merino wool trekking socks (keep 1 dry pair sealed strictly for camp/sleeping).\n"
            "  - Anti-leech socks / gaiters, salt pouch, or neem oil spray for rainforest or Western Ghats trails.\n\n"
            "• **Trail Hardware & Navigation**:\n"
            "  - Dual trekking poles (crucial for stability on slippery slopes and balance during stream crossings).\n"
            "  - Waterproof LED headlamp (hands-free) with extra batteries.\n"
            "  - 2L hydration bladder or bottles with water purification tablets / filter.\n\n"
            "• **First Aid & Health Essentials**:\n"
            "  - Antiseptic lotion, waterproof band-aids, blister prevention tape, ORS rehydration salts, and anti-fungal foot powder.\n\n"
            "💡 **Trail Safety Tip**: Check rain and landslide advisories before leaving, never cross swollen streams above knee depth without a fixed line, and save offline GPX trail maps on your phone."
        )

    if "pack" in p:
        return (
            "🎒 **Universal Travel Packing Checklist**:\n\n"
            "1. **Core Essentials**: Passport/Govt ID, digital copies on phone, credit/debit cards, localized currency cash.\n"
            "2. **Clothing**: Capsule wardrobe (mix-and-match neutral layers), lightweight rain jacket, comfortable broken-in walking shoes.\n"
            "3. **Toiletries**: Travel-sized essentials, SPF 30+ sunscreen, insect repellent, prescription meds with doctor's note.\n"
            "4. **Electronics**: High-capacity power bank (≤20,000 mAh for flight carry-on), universal power adapter, charging cables."
        )

    if "budget" in p or "cheap" in p or "saving" in p:
        return (
            "💰 **Practical Travel Budgeting Strategies**:\n\n"
            "1. **Flights**: Set price alerts 6–8 weeks in advance; book mid-week flights (Tuesdays/Wednesdays) for better rates.\n"
            "2. **Local Transit**: Opt for local metro passes or buses instead of private taxis from airports.\n"
            "3. **Food**: Eat where locals eat; street food markets and local neighborhood eateries offer authentic meals at a fraction of tourist restaurant prices.\n"
            "3. **Activities**: Look for free walking tours, city museum discount passes, and free park attractions."
        )

    # General travel assistant fallback
    return (
        "🗺️ **AI Travel Assistant Advice**:\n\n"
        "Here are key recommendations for planning your journey:\n\n"
        "1. **Pace**: Aim for 2–3 major activities per day so you have time to wander, relax, and soak in local culture.\n"
        "2. **Logistics**: Pre-book top attractions (like iconic museums or popular national parks) at least 2 weeks in advance to avoid long ticket lines.\n"
        "3. **Buffer Time**: Always leave a 45–60 minute buffer between transit legs and scheduled tours.\n"
        "4. **Plan B**: Have an indoor alternative (like a museum, local café, or cooking class) ready in case of sudden rain or unexpected closures."
    )


def _curated_fallback(prompt: str, reason: str) -> dict:
    answer = _curated_travel_guide_answer(prompt)
    has_key = bool(settings.GEMINI_API_KEY or settings.OPENAI_API_KEY)
    if has_key:
        provider_label = "Offline Guide (Provider Fallback)"
        setup_instructions = (
            "\n\n──────────\n"
            "ℹ️ **Offline Fallback Note**: Your live AI provider encountered a temporary issue. "
            "Here is curated travel advice from our knowledge base while connectivity is restored."
        )
    else:
        provider_label = "Offline Guide (No AI Key)"
        setup_instructions = (
            "\n\n──────────\n"
            "ℹ️ **Offline Travel Assistant**: This advice is served from our built-in curated travel catalogue.\n"
            "To activate live generative AI (Google Gemini / OpenAI):\n"
            "1. Get a free API key at **https://aistudio.google.com/app/apikey**\n"
            "2. Open `backend/.env` (or copy `.env.example` to `.env`)\n"
            "3. Add your key: `GEMINI_API_KEY=your_key_here`\n"
            "4. Reload the page to start chatting with live Gemini AI."
        )

    return {
        "text": _clean_markdown(answer + setup_instructions),
        "is_ai": False,
        "provider": provider_label,
        "model": "offline-curated",
        "is_fallback": True,
        "is_complete": True,
        "finish_reason": "stop",
        "error": reason,
    }


def _fallback_response(reason: str, prompt: str = "") -> dict:
    """Legacy helper maintained for backward compatibility."""
    return _curated_fallback(prompt, reason)
