"""
test_phase7_ai_quality.py — Tests for AI response completeness, finish reason handling,
bounded continuation, model fallback, truthful status synchronization, and travel answer quality.
"""

import pytest
from unittest.mock import patch, MagicMock
from starlette.testclient import TestClient

from app.main import app
from app.integrations.ai_provider import (
    generate_text,
    _stitch_continuation,
    _curated_travel_guide_answer,
    _curated_fallback,
    get_ai_status_info,
    ai_provider_name,
)
import app.integrations.ai_provider as ai_provider_mod


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def test_stitch_continuation_deduplication():
    """Verify continuation stitching avoids duplicating repeated phrases."""
    # Exact overlap
    base = "Goa is known for its beautiful coastline and vibrant"
    cont = "vibrant beach shacks offering seafood."
    stitched = _stitch_continuation(base, cont)
    assert stitched == "Goa is known for its beautiful coastline and vibrant beach shacks offering seafood."

    # Split word boundary (space added between alphanumeric characters)
    base2 = "Goa's coastline stretches"
    cont2 = "over 100 kilometers"
    stitched2 = _stitch_continuation(base2, cont2)
    assert stitched2 == "Goa's coastline stretches over 100 kilometers"

    # Continuation that already starts with space
    base3 = "The temperature ranges from 20°C to"
    cont3 = " 32°C."
    assert _stitch_continuation(base3, cont3) == "The temperature ranges from 20°C to 32°C."

    # Empty edge cases
    assert _stitch_continuation("", "hello") == "hello"
    assert _stitch_continuation("hello", "") == "hello"


def test_goa_in_november_travel_quality_curated():
    """Verify curated knowledge for Goa in November covers all expected domains."""
    prompt = "What are the best things to do in Goa in November?"
    answer = _curated_travel_guide_answer(prompt)
    answer_lower = answer.lower()

    # 1. Beaches and water activities with safety caveats
    assert "beach" in answer_lower or "baga" in answer_lower
    assert "water sports" in answer_lower or "swimming" in answer_lower
    assert "safety" in answer_lower or "lifeguards" in answer_lower

    # 2. Heritage and culture
    assert "old goa" in answer_lower or "basilica" in answer_lower
    assert "fontainhas" in answer_lower or "portuguese" in answer_lower

    # 3. Markets, food, and nightlife
    assert "night market" in answer_lower or "arpora" in answer_lower
    assert "curry" in answer_lower or "food" in answer_lower or "dining" in answer_lower

    # 4. Practical weather and planning
    assert "weather" in answer_lower or "20°c" in answer_lower
    assert "book" in answer_lower or "advance" in answer_lower

    # 5. North vs South distinction
    assert "north goa" in answer_lower
    assert "south goa" in answer_lower


@pytest.mark.asyncio
async def test_complete_provider_response():
    """A standard complete response returns is_complete=True and finish_reason='stop'."""
    with patch("app.integrations.ai_provider.settings") as s:
        s.GEMINI_API_KEY = "dummy-key"
        s.OPENAI_API_KEY = ""
        s.GEMINI_MODEL = "gemini-3.8-flash"

        mock_candidate = MagicMock()
        mock_candidate.finish_reason = "STOP"
        part = MagicMock()
        part.thought = False
        part.text = "November in Goa is fantastic. Enjoy Baga Beach and Old Goa."
        mock_candidate.content.parts = [part]

        mock_resp = MagicMock()
        mock_resp.candidates = [mock_candidate]
        mock_resp.text = part.text

        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.models.generate_content.return_value = mock_resp
            mock_client_cls.return_value = mock_client

            res = await generate_text("What to do in Goa in November?")
            assert res["is_ai"] is True
            assert res["is_complete"] is True
            assert res["finish_reason"] == "stop"
            assert "Baga Beach" in res["text"]
            assert res["provider"] == "Gemini (gemini-3.8-flash)"


@pytest.mark.asyncio
async def test_truncated_response_with_successful_continuation():
    """When a response hits MAX_TOKENS, a bounded continuation is invoked and stitched."""
    with patch("app.integrations.ai_provider.settings") as s:
        s.GEMINI_API_KEY = "dummy-key"
        s.OPENAI_API_KEY = ""
        s.GEMINI_MODEL = "gemini-3.8-flash"

        # First call is truncated
        cand1 = MagicMock()
        cand1.finish_reason = "MAX_TOKENS"
        p1 = MagicMock()
        p1.thought = False
        p1.text = "The weather in Goa during November is pleasant (20°C to 32°C / 68°F to"
        cand1.content.parts = [p1]
        resp1 = MagicMock()
        resp1.candidates = [cand1]
        resp1.text = p1.text

        # Second call (continuation) finishes completely
        cand2 = MagicMock()
        cand2.finish_reason = "STOP"
        p2 = MagicMock()
        p2.thought = False
        p2.text = " 90°F) with cool evening sea breezes."
        cand2.content.parts = [p2]
        resp2 = MagicMock()
        resp2.candidates = [cand2]
        resp2.text = p2.text

        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.models.generate_content.side_effect = [resp1, resp2]
            mock_client_cls.return_value = mock_client

            res = await generate_text("What is the weather in Goa?")
            assert res["is_ai"] is True
            assert res["is_complete"] is True
            assert "68°F to 90°F" in res["text"]
            assert res["finish_reason"] == "stop"


@pytest.mark.asyncio
async def test_truncated_response_labels_incomplete_if_still_truncated():
    """If continuation also hits MAX_TOKENS, response is labelled is_complete=False with notice."""
    with patch("app.integrations.ai_provider.settings") as s:
        s.GEMINI_API_KEY = "dummy-key"
        s.OPENAI_API_KEY = ""
        s.GEMINI_MODEL = "gemini-3.8-flash"

        cand1 = MagicMock()
        cand1.finish_reason = "MAX_TOKENS"
        p1 = MagicMock()
        p1.thought = False
        p1.text = "November in Goa has beaches and"
        cand1.content.parts = [p1]
        resp1 = MagicMock()
        resp1.candidates = [cand1]
        resp1.text = p1.text

        cand2 = MagicMock()
        cand2.finish_reason = "MAX_TOKENS"
        p2 = MagicMock()
        p2.thought = False
        p2.text = " water sports and"
        cand2.content.parts = [p2]
        resp2 = MagicMock()
        resp2.candidates = [cand2]
        resp2.text = p2.text

        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.models.generate_content.side_effect = [resp1, resp2]
            mock_client_cls.return_value = mock_client

            res = await generate_text("Tell me everything about Goa.")
            assert res["is_ai"] is True
            assert res["is_complete"] is False
            assert res["finish_reason"] in ("max_tokens", "length")
            assert "reached maximum token limits" in res["text"]


@pytest.mark.asyncio
async def test_model_fallback_and_truthful_attribution():
    """If primary model hits 429 quota, fallback model succeeds and attribution reports fallback."""
    with patch("app.integrations.ai_provider.settings") as s:
        s.GEMINI_API_KEY = "dummy-key"
        s.OPENAI_API_KEY = ""
        s.GEMINI_MODEL = "gemini-3.8-flash"

        # Model 1 (gemini-3.8-flash) raises 429 ResourceExhausted
        # Model 2 (gemini-3.5-flash) succeeds
        success_cand = MagicMock()
        success_cand.finish_reason = "STOP"
        p = MagicMock()
        p.thought = False
        p.text = "Visit Palolem and Anjuna for a great November trip."
        success_cand.content.parts = [p]
        success_resp = MagicMock()
        success_resp.candidates = [success_cand]
        success_resp.text = p.text

        def mock_generate_content(*args, **kwargs):
            model = kwargs.get("model")
            if model == "gemini-3.8-flash":
                raise Exception("429 RESOURCE_EXHAUSTED Quota exceeded")
            return success_resp

        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.models.generate_content.side_effect = mock_generate_content
            mock_client_cls.return_value = mock_client

            res = await generate_text("Where should I go in Goa?")
            assert res["is_ai"] is True
            assert res["is_fallback"] is True
            assert "gemini-3.5-flash" in res["provider"]
            assert res["model"] == "gemini-3.5-flash"

            # Check status info reflects the fallback
            status_info = get_ai_status_info()
            assert status_info["is_fallback"] is True
            assert status_info["active_model"] == "gemini-3.5-flash"


def test_status_endpoint_returns_model_details(client):
    """GET /api/ai/status returns active and configured model fields."""
    resp = client.get("/api/ai/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "is_live" in data
    assert "provider" in data
    assert "configured_model" in data
    assert "active_model" in data
    assert "is_fallback" in data


def test_chat_endpoint_structure(client):
    """POST /api/ai/chat returns expected schema with completeness and model fields."""
    with patch("app.api.ai_chat.generate_text") as mock_gen:
        mock_gen.return_value = {
            "text": "Goa in November is sunny and vibrant.",
            "is_ai": True,
            "provider": "Gemini (gemini-3.5-flash)",
            "model": "gemini-3.5-flash",
            "is_fallback": True,
            "is_complete": True,
            "finish_reason": "stop",
            "error": None,
        }

        resp = client.post("/api/ai/chat", json={"message": "What to do in Goa in November?"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["reply"] == "Goa in November is sunny and vibrant."
        assert data["is_ai"] is True
        assert data["provider"] == "Gemini (gemini-3.5-flash)"
        assert data["model"] == "gemini-3.5-flash"
        assert data["is_fallback"] is True
        assert data["is_complete"] is True
        assert data["finish_reason"] == "stop"
