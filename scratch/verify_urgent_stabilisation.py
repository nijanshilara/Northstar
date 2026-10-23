"""
verify_urgent_stabilisation.py
End-to-end verification covering all 10 mandatory stabilisation scenarios (A to J).
"""

import sys
import os
import json
from datetime import date
from unittest.mock import patch, AsyncMock

# Add backend to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from starlette.testclient import TestClient
from app.main import app
from app.database.session import SessionLocal
from app.models.base import Trip, Activity
from app.models.user import User
from app.core.security import get_password_hash, create_access_token

client = TestClient(app, raise_server_exceptions=True)

def setup_test_user():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "stabilisation_tester@northstar.internal").first()
        if not user:
            user = User(
                email="stabilisation_tester@northstar.internal",
                hashed_password=get_password_hash("TestPass123!"),
                name="Stabilisation Tester",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        return user.id
    finally:
        db.close()

USER_ID = setup_test_user()
AUTH_TOKEN = create_access_token(USER_ID, "stabilisation_tester@northstar.internal")
client.headers["Authorization"] = f"Bearer {AUTH_TOKEN}"

def create_trip(destination: str, dep: str, ret: str, num_days: int, budget: int, currency: str = "INR"):
    db = SessionLocal()
    try:
        trip = Trip(
            user_id=USER_ID,
            name=f"Test {destination}",
            origin="Mumbai, India",
            destination=destination,
            departure_date=date.fromisoformat(dep),
            return_date=date.fromisoformat(ret),
            num_days=num_days,
            budget_minor=budget,
            currency=currency,
            travel_pace="medium",
        )
        db.add(trip)
        db.commit()
        db.refresh(trip)
        return trip.id
    finally:
        db.close()

def run_all_scenarios():
    results = {}
    print("======================================================================")
    print("STARTING MANDATORY E2E VERIFICATION (SCENARIOS A - J)")
    print("======================================================================")

    # ------------------------------------------------------------------
    # A. Kyoto, 15–18 November 2026: exactly four dated day records
    # ------------------------------------------------------------------
    print("\n--- Testing Scenario A: Kyoto 15–18 Nov 2026 (4 days) ---")
    trip_a = create_trip("Kyoto, Japan", "2026-11-15", "2026-11-18", 4, 30000000, "JPY")
    resp_a = client.post(f"/api/itinerary/{trip_a}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert resp_a.status_code == 200, f"Failed: {resp_a.text}"
    data_a = resp_a.json()
    days_a = data_a.get("days", [])
    expected_dates_a = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18"]
    dates_a = [d["date"] for d in days_a]
    assert len(days_a) == 4, f"Expected 4 days, got {len(days_a)}"
    assert dates_a == expected_dates_a, f"Expected {expected_dates_a}, got {dates_a}"
    assert data_a["calendar_complete"] is True
    print(f"[PASS] Scenario A Passed: Exactly 4 dated day records: {dates_a}")
    for d in days_a:
        print(f"   Day {d['day_number']} ({d['date']}): '{d['theme']}' - {len(d['activities'])} activities ({d['status']})")
    results["A"] = True

    # ------------------------------------------------------------------
    # B. Goa, 1–5 December 2026: exactly five dated day records
    # ------------------------------------------------------------------
    print("\n--- Testing Scenario B: Goa 1–5 Dec 2026 (5 days) ---")
    trip_b = create_trip("Goa, India", "2026-12-01", "2026-12-05", 5, 5000000, "INR")
    resp_b = client.post(f"/api/itinerary/{trip_b}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    days_b = data_b.get("days", [])
    expected_dates_b = ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"]
    dates_b = [d["date"] for d in days_b]
    assert len(days_b) == 5, f"Expected 5 days, got {len(days_b)}"
    assert dates_b == expected_dates_b, f"Expected {expected_dates_b}, got {dates_b}"
    assert data_b["calendar_complete"] is True
    print(f"[PASS] Scenario B Passed: Exactly 5 dated day records: {dates_b}")
    for d in days_b:
        print(f"   Day {d['day_number']} ({d['date']}): '{d['theme']}' - {len(d['activities'])} activities ({d['status']})")
    results["B"] = True

    # ------------------------------------------------------------------
    # C. New York, 1–7 December 2026: exactly seven dated day records
    # ------------------------------------------------------------------
    print("\n--- Testing Scenario C: New York 1–7 Dec 2026 (7 days) ---")
    trip_c = create_trip("New York, USA", "2026-12-01", "2026-12-07", 7, 50000000, "USD")
    resp_c = client.post(f"/api/itinerary/{trip_c}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert resp_c.status_code == 200
    data_c = resp_c.json()
    days_c = data_c.get("days", [])
    expected_dates_c = [f"2026-12-0{i}" for i in range(1, 8)]
    dates_c = [d["date"] for d in days_c]
    assert len(days_c) == 7, f"Expected 7 days, got {len(days_c)}"
    assert dates_c == expected_dates_c, f"Expected {expected_dates_c}, got {dates_c}"
    assert data_c["calendar_complete"] is True
    assert data_c["schedule_complete"] is True
    print(f"[PASS] Scenario C Passed: Exactly 7 dated day records: {dates_c}")
    for d in days_c:
        print(f"   Day {d['day_number']} ({d['date']}): '{d['theme']}' - {len(d['activities'])} activities ({d['status']})")
    results["C"] = True

    # ------------------------------------------------------------------
    # D. Gemini unavailable: all expected dates still appear
    # ------------------------------------------------------------------
    print("\n--- Testing Scenario D: Gemini unavailable ---")
    trip_d = create_trip("Kyoto, Japan", "2026-11-15", "2026-11-18", 4, 30000000, "JPY")
    with patch("app.services.itinerary_planner.ai_is_live", return_value=False):
        resp_d = client.post(f"/api/itinerary/{trip_d}/generate", json={"overwrite_unlocked": True, "use_ai": True})
        assert resp_d.status_code == 200
        data_d = resp_d.json()
        assert len(data_d.get("days", [])) == 4, f"Expected 4 days without AI, got {len(data_d.get('days', []))}"
        assert data_d["ai_enhanced"] is False
        assert "offline" in (data_d.get("ai_unavailable_reason") or "").lower() or "offline" in str(data_d)
        print(f"[PASS] Scenario D Passed: Gemini unavailable handled gracefully in {len(data_d['days'])} days; AI offline indicator present.")
    results["D"] = True

    # ------------------------------------------------------------------
    # E. Very restrictive budget: no missing dates and no repeated rejected activities
    # ------------------------------------------------------------------
    print("\n--- Testing Scenario E: Very restrictive budget (¥1,000) ---")
    trip_e = create_trip("Kyoto, Japan", "2026-11-15", "2026-11-18", 4, 100000, "JPY")
    resp_e = client.post(f"/api/itinerary/{trip_e}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert resp_e.status_code == 200
    data_e = resp_e.json()
    days_e = data_e.get("days", [])
    assert len(days_e) == 4, f"All 4 calendar dates must exist, got {len(days_e)}"
    # Check warning deduplication: no activity name repeated in warnings
    warnings_e = data_e.get("warnings", [])
    names_seen = set()
    for w in warnings_e:
        if "insufficient remaining budget" in w.lower():
            # Extract name before "' has"
            if "'" in w:
                name = w.split("'")[1]
                assert name not in names_seen, f"Repeated budget rejection warning for {name}!"
                names_seen.add(name)
    print(f"[PASS] Scenario E Passed: Restrictive budget kept all 4 days. Deduplicated warnings: {len(warnings_e)} unique notices.")
    results["E"] = True

    # ------------------------------------------------------------------
    # F. Insufficient candidate places: dates remain visible with explicit unfilled status
    # ------------------------------------------------------------------
    print("\n--- Testing Scenario F: Insufficient candidate places ---")
    trip_f = create_trip("Reykjavik, Iceland", "2026-07-01", "2026-07-06", 6, 2000000, "EUR")
    resp_f = client.post(f"/api/itinerary/{trip_f}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    assert resp_f.status_code == 200
    data_f = resp_f.json()
    days_f = data_f.get("days", [])
    assert len(days_f) == 6, f"Expected 6 calendar days for unknown place, got {len(days_f)}"
    assert data_f["calendar_complete"] is True
    for d in days_f:
        assert "status" in d
        if d["status"] == "unfilled":
            assert d.get("unfilled_reason"), "Unfilled day must have an explicit reason!"
    print(f"[PASS] Scenario F Passed: All 6 dates present with explicit status tags and unfilled reasons where appropriate.")
    results["F"] = True

    # ------------------------------------------------------------------
    # G. Locked activities: preserved across regeneration
    # ------------------------------------------------------------------
    print("\n--- Testing Scenario G: Locked activities preserved across regeneration ---")
    trip_g = create_trip("Goa, India", "2026-12-01", "2026-12-03", 3, 5000000, "INR")
    # First generate
    resp_g1 = client.post(f"/api/itinerary/{trip_g}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    acts_g1 = resp_g1.json()["activities"]
    assert len(acts_g1) > 0
    # Lock the first activity
    lock_act_id = acts_g1[0]["id"]
    lock_act_name = acts_g1[0]["name"]
    db = SessionLocal()
    try:
        a = db.query(Activity).filter(Activity.id == lock_act_id).first()
        a.is_locked = True
        db.commit()
    finally:
        db.close()
    
    # Regenerate
    resp_g2 = client.post(f"/api/itinerary/{trip_g}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    acts_g2 = resp_g2.json()["activities"]
    locked_found = [a for a in acts_g2 if a["id"] == lock_act_id]
    assert len(locked_found) == 1, f"Locked activity {lock_act_id} ({lock_act_name}) was not preserved!"
    assert locked_found[0]["is_locked"] is True
    print(f"[PASS] Scenario G Passed: Locked activity '{lock_act_name}' (ID {lock_act_id}) preserved across regeneration.")
    results["G"] = True

    # ------------------------------------------------------------------
    # H. Repeated Generate clicks: no duplicated itinerary activities
    # ------------------------------------------------------------------
    print("\n--- Testing Scenario H: Repeated Generate clicks (idempotence) ---")
    trip_h = create_trip("New York, USA", "2026-12-01", "2026-12-03", 3, 50000000, "USD")
    r1 = client.post(f"/api/itinerary/{trip_h}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    count_1 = len(r1.json()["activities"])
    r2 = client.post(f"/api/itinerary/{trip_h}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    count_2 = len(r2.json()["activities"])
    r3 = client.post(f"/api/itinerary/{trip_h}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    count_3 = len(r3.json()["activities"])

    db = SessionLocal()
    try:
        db_count = db.query(Activity).filter(Activity.trip_id == trip_h).count()
    finally:
        db.close()

    assert count_1 == count_2 == count_3 == db_count, f"Activity count mismatch: {count_1}, {count_2}, {count_3}, db={db_count}"
    print(f"[PASS] Scenario H Passed: Repeated generations produced constant {db_count} activities in DB with zero duplication.")
    results["H"] = True

    # ------------------------------------------------------------------
    # I. Backend failure during saving: transaction rollback preserves previous itinerary
    # ------------------------------------------------------------------
    print("\n--- Testing Scenario I: Transaction rollback on save failure ---")
    trip_i = create_trip("Kyoto, Japan", "2026-11-15", "2026-11-17", 3, 30000000, "JPY")
    # Initial generation
    r_init = client.post(f"/api/itinerary/{trip_i}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    initial_ids = {a["id"] for a in r_init.json()["activities"]}
    assert len(initial_ids) > 0

    # Simulate error during generation
    with patch("app.api.itinerary.plan_destination_itinerary", side_effect=RuntimeError("Simulated failure during generation")):
        r_fail = client.post(f"/api/itinerary/{trip_i}/generate", json={"overwrite_unlocked": True, "use_ai": False})
        assert r_fail.status_code == 500 or "Simulated" in r_fail.text

    # Verify previous activities are STILL there intact
    db = SessionLocal()
    try:
        current_ids = {a.id for a in db.query(Activity).filter(Activity.trip_id == trip_i).all()}
    finally:
        db.close()
    assert current_ids == initial_ids, f"Rollback failed! Expected {initial_ids}, found {current_ids}"
    print(f"[PASS] Scenario I Passed: Atomic transaction rolled back cleanly. {len(current_ids)} activities preserved.")
    results["I"] = True

    # ------------------------------------------------------------------
    # J. Refresh the browser after generation: the same complete calendar appears
    # ------------------------------------------------------------------
    print("\n--- Testing Scenario J: Browser refresh / GET /api/itinerary/{trip_id} ---")
    trip_j = create_trip("Goa, India", "2026-12-01", "2026-12-05", 5, 5000000, "INR")
    client.post(f"/api/itinerary/{trip_j}/generate", json={"overwrite_unlocked": True, "use_ai": False})
    
    # Query the refresh endpoint that the React app calls on reload
    r_refresh = client.get(f"/api/itinerary/{trip_j}")
    assert r_refresh.status_code == 200
    data_j = r_refresh.json()
    assert data_j["calendar_complete"] is True
    assert len(data_j["days"]) == 5
    dates_j = [d["date"] for d in data_j["days"]]
    assert dates_j == ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"]
    print(f"[PASS] Scenario J Passed: GET /api/itinerary/{trip_j} returns all 5 dates on refresh with saved activities: {dates_j}")
    results["J"] = True

    print("\n======================================================================")
    print("ALL 10 MANDATORY VERIFICATION SCENARIOS PASSED SUCCESSFULLY!")
    print("======================================================================")
    return results

if __name__ == "__main__":
    run_all_scenarios()
