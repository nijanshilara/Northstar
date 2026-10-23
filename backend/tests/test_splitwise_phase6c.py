"""
Phase 6C Automated Tests — Splitwise Participant Selection & Group Management.
Tests against the real database schema covering all 10 core requirements:
1. Equal splits with even and uneven totals.
2. Exact-amount splits with valid and invalid totals.
3. Percentage splits with valid and invalid totals.
4. Selecting everyone vs selecting a subset.
5. Empty participants and non-member participants.
6. Invalid payer and unauthorised requests.
7. Creating, editing, and deleting expenses.
8. Balance calculations and settlements.
9. Leaving and deleting groups without corrupting historical financial records.
10. Persistence across fresh API requests.
"""

import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database.session import Base, get_db
from app.models.base import Trip, ExpenseGroup, GroupMember, Expense, ExpenseShare, SplitMethod
from app.models.user import User

TEST_DB_URL = "sqlite:///./test_splitwise_phase6c.db"
engine_test = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    app.dependency_overrides[get_db] = _override_get_db
    Base.metadata.create_all(bind=engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture
def test_group_setup(client):
    """Create a persistent test group with 4 members: Alice, Bob, Charlie, David."""
    payload = {
        "name": "Phase 6C Himalayan Trek",
        "currency": "INR",
        "members": [
            {"name": "Alice"},
            {"name": "Bob"},
            {"name": "Charlie"},
            {"name": "David"},
        ],
    }
    res = client.post("/api/expenses/groups", json=payload)
    assert res.status_code == 201, res.text
    group = res.json()
    members = {m["name"]: m for m in group["members"]}
    return group["id"], members


# ---------------------------------------------------------------------------
# 1. Equal splits with even and uneven totals
# ---------------------------------------------------------------------------

def test_equal_split_even_and_uneven(client, test_group_setup):
    gid, members = test_group_setup

    # Case A: Even total ₹300 (30,000 paise) among 3 members (Alice, Bob, Charlie)
    pids = [members["Alice"]["id"], members["Bob"]["id"], members["Charlie"]["id"]]
    res_even = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": members["Alice"]["id"],
        "description": "Lunch at Dhaba",
        "amount_minor": 30000,
        "split_method": "equal",
        "participant_ids": pids,
    })
    assert res_even.status_code == 201
    even_shares = res_even.json()["shares"]
    assert len(even_shares) == 3
    assert all(s["share_minor"] == 10000 for s in even_shares)
    assert sum(s["share_minor"] for s in even_shares) == 30000

    # Case B: Uneven total ₹100 (10,000 paise) among 3 members
    # 10,000 // 3 = 3333 with 1 remainder -> 3334, 3333, 3333
    res_uneven = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": members["Bob"]["id"],
        "description": "Tea & Snacks",
        "amount_minor": 10000,
        "split_method": "equal",
        "participant_ids": pids,
    })
    assert res_uneven.status_code == 201
    uneven_shares = res_uneven.json()["shares"]
    assert len(uneven_shares) == 3
    assert sum(s["share_minor"] for s in uneven_shares) == 10000
    assert uneven_shares[0]["share_minor"] == 3334
    assert uneven_shares[1]["share_minor"] == 3333
    assert uneven_shares[2]["share_minor"] == 3333

    # Case C: Extreme small uneven total ₹1 (100 paise) among 3 members -> 34, 33, 33
    res_small = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": members["Charlie"]["id"],
        "description": "Candies",
        "amount_minor": 100,
        "split_method": "equal",
        "participant_ids": pids,
    })
    assert res_small.status_code == 201
    small_shares = res_small.json()["shares"]
    assert sum(s["share_minor"] for s in small_shares) == 100
    assert small_shares[0]["share_minor"] == 34
    assert small_shares[1]["share_minor"] == 33
    assert small_shares[2]["share_minor"] == 33


# ---------------------------------------------------------------------------
# 2. Exact-amount splits with valid and invalid totals
# ---------------------------------------------------------------------------

def test_exact_amount_splits(client, test_group_setup):
    gid, members = test_group_setup
    m1 = members["Alice"]["id"]
    m2 = members["Bob"]["id"]

    # Valid exact split: Total ₹150 (15,000 paise) = Alice 6,000 + Bob 9,000
    res_valid = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": m1,
        "description": "Kayaking rentals",
        "amount_minor": 15000,
        "split_method": "exact",
        "shares": [
            {"member_id": m1, "share_minor": 6000},
            {"member_id": m2, "share_minor": 9000},
        ],
    })
    assert res_valid.status_code == 201
    data = res_valid.json()
    assert sum(s["share_minor"] for s in data["shares"]) == 15000

    # Invalid exact split: Under total (14,000 != 15,000) -> 400 Bad Request
    res_under = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": m1,
        "description": "Kayaking invalid under",
        "amount_minor": 15000,
        "split_method": "exact",
        "shares": [
            {"member_id": m1, "share_minor": 6000},
            {"member_id": m2, "share_minor": 8000},
        ],
    })
    assert res_under.status_code == 400
    assert "does not match the expense amount" in res_under.json()["detail"]

    # Invalid exact split: Over total (16,000 != 15,000) -> 400 Bad Request
    res_over = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": m1,
        "description": "Kayaking invalid over",
        "amount_minor": 15000,
        "split_method": "exact",
        "shares": [
            {"member_id": m1, "share_minor": 6000},
            {"member_id": m2, "share_minor": 10000},
        ],
    })
    assert res_over.status_code == 400
    assert "does not match the expense amount" in res_over.json()["detail"]

    # Missing shares for exact split -> 400 Bad Request
    res_missing = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": m1,
        "description": "Kayaking missing shares",
        "amount_minor": 15000,
        "split_method": "exact",
    })
    assert res_missing.status_code == 400


# ---------------------------------------------------------------------------
# 3. Percentage splits with valid and invalid totals
# ---------------------------------------------------------------------------

def test_percentage_splits(client, test_group_setup):
    gid, members = test_group_setup
    m1 = members["Alice"]["id"]
    m2 = members["Bob"]["id"]
    m3 = members["Charlie"]["id"]

    # Valid percentage (basis points: 50% + 50% = 10,000 basis points)
    res_valid_bp = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": m1,
        "description": "Hotel Room Upgrade",
        "amount_minor": 20000,
        "split_method": "percentage",
        "shares": [
            {"member_id": m1, "share_minor": 5000},
            {"member_id": m2, "share_minor": 5000},
        ],
    })
    assert res_valid_bp.status_code == 201
    shares_bp = res_valid_bp.json()["shares"]
    assert sum(s["share_minor"] for s in shares_bp) == 20000
    assert shares_bp[0]["share_minor"] == 10000
    assert shares_bp[1]["share_minor"] == 10000

    # Valid percentage (whole numbers: 30% + 70% = 100%)
    res_valid_100 = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": m1,
        "description": "Car Rental Fuel",
        "amount_minor": 10000,
        "split_method": "percentage",
        "shares": [
            {"member_id": m1, "share_minor": 30},
            {"member_id": m2, "share_minor": 70},
        ],
    })
    assert res_valid_100.status_code == 201
    shares_100 = res_valid_100.json()["shares"]
    assert sum(s["share_minor"] for s in shares_100) == 10000
    assert shares_100[0]["share_minor"] == 3000
    assert shares_100[1]["share_minor"] == 7000

    # Uneven percentages with rounding: 33.33% + 33.33% + 33.34% on ₹100
    res_uneven_pct = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": m1,
        "description": "Guide Fee",
        "amount_minor": 10000,
        "split_method": "percentage",
        "shares": [
            {"member_id": m1, "share_minor": 3333},
            {"member_id": m2, "share_minor": 3333},
            {"member_id": m3, "share_minor": 3334},
        ],
    })
    assert res_uneven_pct.status_code == 201
    shares_uneven = res_uneven_pct.json()["shares"]
    assert sum(s["share_minor"] for s in shares_uneven) == 10000

    # Invalid percentage sum != 100% (e.g. 90% = 9000 bp) -> 400 Bad Request
    res_invalid_pct = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": m1,
        "description": "Invalid pct",
        "amount_minor": 10000,
        "split_method": "percentage",
        "shares": [
            {"member_id": m1, "share_minor": 4500},
            {"member_id": m2, "share_minor": 4500},
        ],
    })
    assert res_invalid_pct.status_code == 400
    assert "Percentages must total 100%" in res_invalid_pct.json()["detail"]


# ---------------------------------------------------------------------------
# 4. Selecting everyone vs selecting a subset
# ---------------------------------------------------------------------------

def test_everyone_vs_subset_participants(client, test_group_setup):
    gid, members = test_group_setup

    # Case A: Everyone in group (4 members)
    res_all = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": members["Alice"]["id"],
        "description": "Group Cabin",
        "amount_minor": 40000,
        "split_method": "equal",
    })
    assert res_all.status_code == 201
    assert len(res_all.json()["shares"]) == 4

    # Case B: Manually selected subset of 2 members (Bob & David only)
    res_subset = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": members["Alice"]["id"],
        "description": "Horse Riding for Bob & David",
        "amount_minor": 20000,
        "split_method": "equal",
        "participant_ids": [members["Bob"]["id"], members["David"]["id"]],
    })
    assert res_subset.status_code == 201
    subset_shares = res_subset.json()["shares"]
    assert len(subset_shares) == 2
    participant_member_ids = {s["member_id"] for s in subset_shares}
    assert participant_member_ids == {members["Bob"]["id"], members["David"]["id"]}
    # Neither Alice nor Charlie are in the shares
    assert members["Alice"]["id"] not in participant_member_ids
    assert members["Charlie"]["id"] not in participant_member_ids


# ---------------------------------------------------------------------------
# 5. Empty participants and non-member participants validation
# ---------------------------------------------------------------------------

def test_empty_and_non_member_participants(client, test_group_setup):
    gid, members = test_group_setup

    # Empty participant list -> 400 Bad Request
    res_empty = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": members["Alice"]["id"],
        "description": "Empty participants",
        "amount_minor": 5000,
        "split_method": "equal",
        "participant_ids": [],
    })
    assert res_empty.status_code == 400
    assert "At least one participant must be selected" in res_empty.json()["detail"]

    # Non-member participant ID 999999 -> 400 Bad Request
    res_non_member = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": members["Alice"]["id"],
        "description": "Ghost participant",
        "amount_minor": 5000,
        "split_method": "equal",
        "participant_ids": [999999],
    })
    assert res_non_member.status_code == 400
    assert "not members of this group" in res_non_member.json()["detail"]

    # Mixed valid member + non-member -> 400 Bad Request
    res_mixed = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": members["Alice"]["id"],
        "description": "Mixed participant",
        "amount_minor": 5000,
        "split_method": "equal",
        "participant_ids": [members["Alice"]["id"], 999999],
    })
    assert res_mixed.status_code == 400
    assert "not members of this group" in res_mixed.json()["detail"]


# ---------------------------------------------------------------------------
# 6. Invalid payer and unauthorised requests
# ---------------------------------------------------------------------------

def test_invalid_payer_and_permissions(client, test_group_setup):
    gid, members = test_group_setup

    # Payer not in group -> 400 Bad Request
    res_bad_payer = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": 999999,
        "description": "Bad payer",
        "amount_minor": 5000,
        "split_method": "equal",
    })
    assert res_bad_payer.status_code == 400
    assert "paid_by_id is not a member of this group" in res_bad_payer.json()["detail"]

    # Invalid group ID -> 404 Not Found
    res_bad_group = client.post("/api/expenses/", json={
        "group_id": 999999,
        "paid_by_id": members["Alice"]["id"],
        "description": "Bad group",
        "amount_minor": 5000,
    })
    assert res_bad_group.status_code == 404


# ---------------------------------------------------------------------------
# 7. Creating, editing, and deleting expenses
# ---------------------------------------------------------------------------

def test_expense_crud_flow(client, test_group_setup):
    gid, members = test_group_setup
    m1 = members["Alice"]["id"]
    m2 = members["Bob"]["id"]

    # 1. Create
    res_create = client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": m1,
        "description": "Initial Rafting Fee",
        "amount_minor": 10000,
        "split_method": "equal",
        "participant_ids": [m1, m2],
    })
    assert res_create.status_code == 201
    exp_id = res_create.json()["id"]

    # 2. Edit description, amount and change participants to David
    res_update = client.put(f"/api/expenses/{exp_id}", json={
        "description": "VIP Rafting Expedition",
        "amount_minor": 16000,
        "participant_ids": [m1, members["David"]["id"]],
    })
    assert res_update.status_code == 200
    updated = res_update.json()
    assert updated["description"] == "VIP Rafting Expedition"
    assert updated["amount_minor"] == 16000
    assert sum(s["share_minor"] for s in updated["shares"]) == 16000
    share_members = {s["member_id"] for s in updated["shares"]}
    assert share_members == {m1, members["David"]["id"]}

    # 3. Delete
    res_delete = client.delete(f"/api/expenses/{exp_id}")
    assert res_delete.status_code == 200
    assert res_delete.json()["status"] == "deleted"

    # 4. Verify deleted
    res_check = client.get(f"/api/expenses/{exp_id}")
    assert res_check.status_code == 404


# ---------------------------------------------------------------------------
# 8. Balance calculations and settlements
# ---------------------------------------------------------------------------

def test_balance_and_debt_settlement(client):
    # Setup dedicated fresh group for exact balance assertions
    res_grp = client.post("/api/expenses/groups", json={
        "name": "Settlement Test Group",
        "currency": "INR",
        "members": [{"name": "Priya"}, {"name": "Rohan"}],
    })
    gid = res_grp.json()["id"]
    priya_id = res_grp.json()["members"][0]["id"]
    rohan_id = res_grp.json()["members"][1]["id"]

    # Priya pays ₹500 (50,000 paise) for dinner, split equally with Rohan
    client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": priya_id,
        "description": "Dinner at Taj",
        "amount_minor": 50000,
        "split_method": "equal",
        "participant_ids": [priya_id, rohan_id],
    })

    # Check settlements: Rohan should owe Priya ₹250 (25,000 paise)
    res_settle1 = client.get(f"/api/expenses/groups/{gid}/settlements")
    assert res_settle1.status_code == 200
    s_plan = res_settle1.json()
    assert len(s_plan["settlements"]) == 1
    t = s_plan["settlements"][0]
    assert t["from_member_id"] == rohan_id
    assert t["to_member_id"] == priya_id
    assert t["amount_minor"] == 25000

    # Execute Settle Up: Rohan pays Priya ₹250
    res_pay = client.post(f"/api/expenses/groups/{gid}/settle", json={
        "from_member_id": rohan_id,
        "to_member_id": priya_id,
        "amount_minor": 25000,
        "notes": "Settled via UPI",
    })
    assert res_pay.status_code == 201
    settlement_exp = res_pay.json()
    assert settlement_exp["category"] == "settlement"
    assert settlement_exp["paid_by_id"] == rohan_id
    assert settlement_exp["shares"][0]["member_id"] == priya_id
    assert settlement_exp["shares"][0]["share_minor"] == 25000

    # Check settlements again: should be 100% cleared!
    res_settle2 = client.get(f"/api/expenses/groups/{gid}/settlements")
    s_plan2 = res_settle2.json()
    assert len(s_plan2["settlements"]) == 0
    # Both net balances must be exactly 0
    for b in s_plan2["balances"]:
        assert b["net_minor"] == 0


# ---------------------------------------------------------------------------
# 9. Leaving and deleting groups without corrupting historical financial records
# ---------------------------------------------------------------------------

def test_safe_leaving_and_deleting_group(client):
    res_grp = client.post("/api/expenses/groups", json={
        "name": "Safety Test Gang",
        "currency": "INR",
        "members": [{"name": "Founder"}, {"name": "MemberA"}, {"name": "MemberB"}],
    })
    gid = res_grp.json()["id"]
    founder_id = res_grp.json()["members"][0]["id"]
    member_a_id = res_grp.json()["members"][1]["id"]
    member_b_id = res_grp.json()["members"][2]["id"]

    # Founder pays ₹300 split equally among all 3
    client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": founder_id,
        "description": "Taxi",
        "amount_minor": 30000,
        "split_method": "equal",
    })

    # MemberA currently owes ₹100 -> Attempting to leave must be blocked with 400
    res_leave_blocked = client.post(f"/api/expenses/groups/{gid}/leave", json={"member_id": member_a_id})
    assert res_leave_blocked.status_code == 400
    assert "active balance" in res_leave_blocked.json()["detail"].lower()

    # Settle MemberA's debt
    client.post(f"/api/expenses/groups/{gid}/settle", json={
        "from_member_id": member_a_id,
        "to_member_id": founder_id,
        "amount_minor": 10000,
    })

    # MemberA's balance is now ₹0.00 -> Leaving must succeed!
    res_leave_success = client.post(f"/api/expenses/groups/{gid}/leave", json={"member_id": member_a_id})
    assert res_leave_success.status_code == 200
    assert res_leave_success.json()["status"] == "left"

    # MemberA has historical expenses: MemberA must be marked is_active=False without deleting record!
    res_grp_after = client.get(f"/api/expenses/groups/{gid}")
    members_after = res_grp_after.json()["members"]
    member_a_after = next(m for m in members_after if m["id"] == member_a_id)
    assert member_a_after["is_active"] is False

    # Historical expenses remain 100% intact
    res_exp_after = client.get(f"/api/expenses/groups/{gid}/expenses")
    assert len(res_exp_after.json()) == 2  # Taxi + Settlement

    # Group deletion safety: MemberB still owes money -> Deleting without force must be blocked
    res_del_blocked = client.delete(f"/api/expenses/groups/{gid}")
    assert res_del_blocked.status_code == 400
    assert "unsettled" in res_del_blocked.json()["detail"].lower()

    # Deleting with force=true succeeds
    res_del_force = client.delete(f"/api/expenses/groups/{gid}?force=true")
    assert res_del_force.status_code == 200
    assert res_del_force.json()["status"] == "deleted"


# ---------------------------------------------------------------------------
# 10. Persistence after fresh database request
# ---------------------------------------------------------------------------

def test_persistence_across_fresh_requests(client):
    # 1. Create group and add a new member via the add_member endpoint
    res_grp = client.post("/api/expenses/groups", json={
        "name": "Persistence Verification Trip",
        "currency": "USD",
        "members": [{"name": "Sam"}, {"name": "Alex"}],
    })
    gid = res_grp.json()["id"]

    res_add_member = client.post(f"/api/expenses/groups/{gid}/members", json={"name": "Taylor"})
    assert res_add_member.status_code == 201
    taylor_id = res_add_member.json()["id"]

    # 2. Add exact-amount expense
    sam_id = res_grp.json()["members"][0]["id"]
    client.post("/api/expenses/", json={
        "group_id": gid,
        "paid_by_id": sam_id,
        "description": "Snorkeling equipment",
        "amount_minor": 9000,
        "split_method": "exact",
        "shares": [
            {"member_id": sam_id, "share_minor": 4500},
            {"member_id": taylor_id, "share_minor": 4500},
        ],
    })

    # 3. Simulate fresh session/restart: fetch directly via new API request
    res_recheck = client.get(f"/api/expenses/groups/{gid}")
    assert res_recheck.status_code == 200
    group_data = res_recheck.json()
    assert len(group_data["members"]) == 3
    assert any(m["name"] == "Taylor" for m in group_data["members"])

    # Verify expenses and shares persisted
    res_expenses = client.get(f"/api/expenses/groups/{gid}/expenses")
    assert len(res_expenses.json()) == 1
    exp = res_expenses.json()[0]
    assert exp["amount_minor"] == 9000
    assert exp["currency"] == "USD"
    assert len(exp["shares"]) == 2
    assert sum(s["share_minor"] for s in exp["shares"]) == 9000
