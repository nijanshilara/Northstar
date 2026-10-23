"""
test_e2e_workflow.py — End-to-End pre-submission verification of full Northstar workflow.

Covers:
  1. Auth: Sign in with authenticated test account (or register ephemeral test user).
  2. Trip: Create a new trip (destination, dates, travellers, budget).
  3. Itinerary: Generate itinerary across all trip days.
  4. Persistence: Verify activities persist and reload accurately.
  5. Weather: Test destination weather query.
  6. Currency: Test currency conversion with Frankfurter proxy.
  7. Splitwise: Create expense group, add members, record expense, verify math.
  8. AI Assistant: Verify /api/ai/chat and /api/ai/status.
  9. Session: Sign out, re-authenticate, verify access to saved trip.
  10. Teardown: Clean up ONLY the ephemeral test records created during this run.
"""

from datetime import date, timedelta
from unittest.mock import patch
from starlette.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_complete_end_to_end_demonstration_workflow():
    # -------------------------------------------------------------------------
    # 1. Authentication: Register / Login test user
    # -------------------------------------------------------------------------
    test_email = f"e2e_student_{date.today().strftime('%Y%m%d')}@northstar.example.com"
    test_password = "SecurePassword123!"

    # Attempt register (or login if exists)
    reg_resp = client.post(
        "/api/auth/register",
        json={"email": test_email, "password": test_password, "name": "Presentation Student"},
    )
    if reg_resp.status_code in (400, 409):
        login_resp = client.post(
            "/api/auth/login",
            json={"email": test_email, "password": test_password},
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    else:
        assert reg_resp.status_code == 201, f"Register failed: {reg_resp.text}"
        login_resp = client.post(
            "/api/auth/login",
            json={"email": test_email, "password": test_password},
        )
        assert login_resp.status_code == 200

    # Verify session profile
    me_resp = client.get("/api/auth/me")
    assert me_resp.status_code == 200
    user_id = me_resp.json()["id"]

    # -------------------------------------------------------------------------
    # 2. Trip Creation: Create a 3-day trip
    # -------------------------------------------------------------------------
    dep = date.today() + timedelta(days=14)
    ret = dep + timedelta(days=2)  # 3 days total
    trip_payload = {
        "name": "E2E College Presentation Trip",
        "origin": "Mumbai, India",
        "destination": "Goa, India",
        "departure_date": dep.isoformat(),
        "return_date": ret.isoformat(),
        "num_travellers": 2,
        "budget_minor": 3000000,  # 30,000 INR
        "currency": "INR",
        "travel_styles": ["leisurely", "food_nightlife"],
    }
    trip_resp = client.post("/api/trips/", json=trip_payload)
    assert trip_resp.status_code == 201
    trip_data = trip_resp.json()
    trip_id = trip_data["id"]
    assert trip_data["num_days"] == 3
    assert trip_data["destination"] == "Goa, India"

    try:
        # -------------------------------------------------------------------------
        # 3. Itinerary Generation: Generate activities
        # -------------------------------------------------------------------------
        gen_resp = client.post(
            f"/api/itinerary/{trip_id}/generate",
            json={"overwrite_unlocked": True, "use_ai": False},
        )
        assert gen_resp.status_code == 200
        gen_data = gen_resp.json()
        assert len(gen_data["activities"]) > 0
        assert len(gen_data["days"]) == 3
        assert gen_data["calendar_complete"] is True

        # -------------------------------------------------------------------------
        # 4. Persistence: Verify activities persist upon retrieval (e.g. reload)
        # -------------------------------------------------------------------------
        get_itin_resp = client.get(f"/api/itinerary/{trip_id}")
        assert get_itin_resp.status_code == 200
        saved_itin = get_itin_resp.json()
        assert len(saved_itin["activities"]) == len(gen_data["activities"])
        assert len(saved_itin["days"]) == 3
        # Ensure day 1, 2, 3 have dates
        for idx, day in enumerate(saved_itin["days"], start=1):
            assert day["day_number"] == idx
            assert day["date"] is not None

        # -------------------------------------------------------------------------
        # 5. Weather: Test destination weather query
        # -------------------------------------------------------------------------
        weather_resp = client.get("/api/weather?city=Goa")
        assert weather_resp.status_code == 200
        weather_data = weather_resp.json()
        assert "days" in weather_data
        assert len(weather_data["days"]) >= 1

        # -------------------------------------------------------------------------
        # 6. Currency Converter: Test Frankfurter integration & same-currency
        # -------------------------------------------------------------------------
        conv_resp = client.get("/api/currency/convert?from=USD&to=INR&amount=100")
        assert conv_resp.status_code == 200
        conv_data = conv_resp.json()
        assert conv_data["from"] == "USD"
        assert conv_data["to"] == "INR"
        assert conv_data["converted_amount"] > 0
        assert "Frankfurter" in conv_data["provider"]

        same_curr_resp = client.get("/api/currency/convert?from=INR&to=INR&amount=500")
        assert same_curr_resp.status_code == 200
        assert same_curr_resp.json()["converted_amount"] == 500.0

        # -------------------------------------------------------------------------
        # 7. Splitwise: Create expense group, record expense, verify math
        # -------------------------------------------------------------------------
        grp_resp = client.post(
            "/api/expenses/groups",
            json={
                "name": "E2E Goa Travel Group",
                "currency": "INR",
                "trip_id": trip_id,
                "members": [
                    {"name": "Alice Presentation", "email": "alice@test.com"},
                    {"name": "Bob Presentation", "email": "bob@test.com"},
                ],
            },
        )
        assert grp_resp.status_code == 201
        grp_data = grp_resp.json()
        group_id = grp_data["id"]
        members = grp_data["members"]
        m1_id = members[0]["id"]
        m2_id = members[1]["id"]

        # Record a shared dinner expense of 2000 INR (200000 paise) split equally
        exp_resp = client.post(
            "/api/expenses/",
            json={
                "group_id": group_id,
                "paid_by_id": m1_id,
                "description": "Seafood Dinner",
                "amount_minor": 200000,
                "split_type": "equal",
                "participant_ids": [m1_id, m2_id],
            },
        )
        assert exp_resp.status_code == 201

        # Check group balances and settlement plan
        grp_details = client.get(f"/api/expenses/groups/{group_id}/settlements")
        assert grp_details.status_code == 200
        balance_data = grp_details.json()
        assert balance_data["total_expenses_minor"] == 200000
        assert len(balance_data["balances"]) == 2
        # Sum of net balances must equal zero exactly
        net_sum = sum(b["net_minor"] for b in balance_data["balances"])
        assert net_sum == 0, f"Net balances must sum to zero, got {net_sum}"

        # -------------------------------------------------------------------------
        # 8. AI Assistant: Verify status and chat response structure
        # -------------------------------------------------------------------------
        ai_status = client.get("/api/ai/status")
        assert ai_status.status_code == 200
        assert "provider" in ai_status.json()

        with patch("app.api.ai_chat.generate_text", return_value={
            "text": "The best time to visit Goa is between November and February.",
            "is_ai": True,
            "provider": "gemini",
            "model": "gemini-2.0-flash",
            "is_fallback": False,
            "is_complete": True,
            "finish_reason": "stop",
            "error": None,
        }):
            chat_resp = client.post(
                "/api/ai/chat",
                json={"message": "What is the best time to visit Goa?", "context": "Trip to Goa, India"},
            )
            assert chat_resp.status_code == 200
            chat_data = chat_resp.json()
            assert "reply" in chat_data
            assert len(chat_data["reply"]) > 0

        # -------------------------------------------------------------------------
        # 9. Session Persistence: Logout and verify re-auth
        # -------------------------------------------------------------------------
        logout_resp = client.post("/api/auth/logout")
        assert logout_resp.status_code == 200

        # Re-login with test credentials
        relogin_resp = client.post(
            "/api/auth/login",
            json={"email": test_email, "password": test_password},
        )
        assert relogin_resp.status_code == 200

        # Verify saved trip is still accessible by the user
        user_trips = client.get("/api/trips/")
        assert user_trips.status_code == 200
        trip_ids = [t["id"] for t in user_trips.json()]
        assert trip_id in trip_ids

    finally:
        # -------------------------------------------------------------------------
        # 10. Clean up only the ephemeral test trip created during this test run
        # -------------------------------------------------------------------------
        client.delete(f"/api/trips/{trip_id}")
