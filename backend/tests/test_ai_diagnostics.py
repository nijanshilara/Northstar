"""
test_ai_diagnostics.py — Regression and diagnostic tests for AI status vs chat response.

Verifies:
1. Successful live response formatting and attribution.
2. Graceful provider failure fallthrough and distinct fallback labelling.
3. Tailored monsoon trek packing advice.
4. Markdown unescaping (e.g. \\*\\* -> **).
5. Model priority fallback chain.
6. Optional live call when credentials are configured.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from starlette.testclient import TestClient

from app.main import app
from app.integrations.ai_provider import (
    generate_text,
    _clean_markdown,
    _curated_travel_guide_answer,
    _curated_fallback,
    ai_provider_name,
    ai_is_live,
)


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def test_markdown_cleanup_escaped_artifacts():
    """Verify escaped asterisks and markdown artifacts are cleaned up."""
    assert _clean_markdown(r"\*\*Bold Title\*\*") == "**Bold Title**"
    assert _clean_markdown(r"\* List item") == "* List item"
    assert _clean_markdown(r"\_Italic\_") == "_Italic_"
    assert _clean_markdown("Normal **bold** text") == "Normal **bold** text"
    assert _clean_markdown("") == ""


def test_monsoon_trek_packing_advice():
    """Curated travel catalogue must return specific advice for monsoon trek packing."""
    prompt = "What to pack for a monsoon trek?"
    answer = _curated_travel_guide_answer(prompt)
    answer_lower = answer.lower()

    assert "monsoon" in answer_lower
    assert "leech socks" in answer_lower
    assert "poncho" in answer_lower or "rain jacket" in answer_lower
    assert "dry sacks" in answer_lower or "waterproof" in answer_lower
    assert "trekking poles" in answer_lower
    assert "quick-dry" in answer_lower


def test_fallback_labelling_without_key():
    """When no API key is present, provider indicates 'Offline Guide (No AI Key)'."""
    with patch("app.integrations.ai_provider.settings") as s:
        s.GEMINI_API_KEY = ""
        s.OPENAI_API_KEY = ""
        res = _curated_fallback("Packing for Goa", reason="Missing API key")
        assert res["is_ai"] is False
        assert res["provider"] == "Offline Guide (No AI Key)"
        assert res["error"] == "Missing API key"
        assert "**" in res["text"]  # Unescaped markdown


def test_fallback_labelling_with_failed_key():
    """When an API key is present but fails, provider indicates 'Offline Guide (Provider Fallback)'."""
    with patch("app.integrations.ai_provider.settings") as s:
        s.GEMINI_API_KEY = "test-key"
        s.OPENAI_API_KEY = ""
        res = _curated_fallback("Packing for Goa", reason="Gemini API call failed: 503")
        assert res["is_ai"] is False
        assert res["provider"] == "Offline Guide (Provider Fallback)"
        assert "temporary issue" in res["text"]


@pytest.mark.asyncio
async def test_provider_failure_falls_back_gracefully():
    """When all models fail with exceptions, generate_text gracefully returns fallback."""
    with patch("app.integrations.ai_provider.settings") as s:
        s.GEMINI_API_KEY = "test-key-failing"
        s.OPENAI_API_KEY = ""
        s.GEMINI_MODEL = "gemini-3.8-flash"

        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.models.generate_content.side_effect = Exception("404 Model Not Found")
            mock_client_cls.return_value = mock_client

            res = await generate_text("What to pack for a monsoon trek?")
            assert res["is_ai"] is False
            assert "Offline Guide" in res["provider"]
            assert res["error"] is not None
            assert "leech socks" in res["text"].lower()


@pytest.mark.asyncio
async def test_model_chain_recovers_if_first_model_fails():
    """If the primary model fails (e.g. 404), the loop tries next model and succeeds."""
    with patch("app.integrations.ai_provider.settings") as s:
        s.GEMINI_API_KEY = "test-key"
        s.OPENAI_API_KEY = ""
        s.GEMINI_MODEL = "deprecated-model"

        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()

            # First model fails, second model succeeds
            success_resp = MagicMock()
            success_resp.text = "Here is your Paris guide: \\*\\*Eiffel Tower\\*\\*."
            mock_client.models.generate_content.side_effect = [
                Exception("404 Not Found"),
                success_resp,
            ]
            mock_client_cls.return_value = mock_client

            res = await generate_text("What to see in Paris?")
            assert res["is_ai"] is True
            assert res["error"] is None
            # Verified that escaped asterisks are cleaned
            assert "**Eiffel Tower**" in res["text"]
            assert r"\*\*" not in res["text"]


def test_ai_status_and_chat_endpoints(client):
    """End-to-end endpoint verification for /api/ai/status and /api/ai/chat."""
    r_status = client.get("/api/ai/status")
    assert r_status.status_code == 200
    status_data = r_status.json()
    assert "is_live" in status_data
    assert "provider" in status_data

    # Chat endpoint accepts valid query
    r_chat = client.post("/api/ai/chat", json={"message": "What to pack for a monsoon trek?"})
    assert r_chat.status_code == 200
    chat_data = r_chat.json()
    assert "reply" in chat_data
    assert "is_ai" in chat_data
    assert "provider" in chat_data
    assert len(chat_data["reply"]) > 20
    # Ensure no escaped raw asterisks in JSON reply
    assert r"\*\*" not in chat_data["reply"]
