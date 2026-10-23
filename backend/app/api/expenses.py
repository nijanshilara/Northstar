"""Expense groups and expenses router."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date

from app.database.session import get_db
from app.models.base import ExpenseGroup, GroupMember, Expense, ExpenseShare, SplitMethod, Trip
from app.models.user import User
from app.api.auth import get_current_user_optional
from app.schemas.schemas import (
    ExpenseGroupCreate, ExpenseGroupOut,
    GroupMemberAdd, GroupMemberOut,
    ExpenseCreate, ExpenseUpdate, ExpenseOut,
    SettlementPlan, MemberBalance, Settlement,
    GroupLeaveRequest, SettleDebtRequest,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------

@router.get("/groups", response_model=List[ExpenseGroupOut])
def list_groups(db: Session = Depends(get_db)):
    return db.query(ExpenseGroup).order_by(ExpenseGroup.created_at.desc()).all()


@router.post("/groups", response_model=ExpenseGroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: ExpenseGroupCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    valid_members = [m for m in payload.members if m.name.strip()]
    if len(valid_members) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 members are required to create an expense group."
        )

    # Check for duplicate member names within group
    member_names = [m.name.strip() for m in valid_members]
    if len({name.lower() for name in member_names}) != len(member_names):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group members must have unique names."
        )

    # If trip_id provided and user authenticated, check trip ownership if restricted
    group_currency = payload.currency.upper()
    if payload.trip_id is not None:
        trip = db.query(Trip).filter(Trip.id == payload.trip_id).first()
        if not trip:
            raise HTTPException(status_code=404, detail="Referenced trip not found")
        if current_user and trip.user_id and trip.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to attach an expense group to this trip"
            )
        # If payload currency was default INR but the trip has a configured currency, align with the trip
        if payload.currency == "INR" and trip.currency and trip.currency != "INR":
            group_currency = trip.currency.upper()

    group = ExpenseGroup(
        trip_id=payload.trip_id,
        name=payload.name.strip(),
        currency=group_currency,
    )
    db.add(group)
    db.flush()  # get the group id

    for m in valid_members:
        db.add(GroupMember(
            group_id=group.id,
            name=m.name.strip(),
            email=m.email.strip() if m.email else None,
            is_active=True,
        ))
    db.commit()
    db.refresh(group)
    return group


@router.get("/groups/{group_id}", response_model=ExpenseGroupOut)
def get_group(group_id: int, db: Session = Depends(get_db)):
    g = db.query(ExpenseGroup).filter(ExpenseGroup.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return g


@router.post("/groups/{group_id}/members", response_model=GroupMemberOut, status_code=status.HTTP_201_CREATED)
def add_group_member(
    group_id: int,
    payload: GroupMemberAdd,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Add a new member to an existing expense group."""
    group = db.query(ExpenseGroup).filter(ExpenseGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if group.trip_id is not None and current_user:
        trip = db.query(Trip).filter(Trip.id == group.trip_id).first()
        if trip and trip.user_id and trip.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this group")

    cleaned_name = payload.name.strip()
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="Member name cannot be blank")

    # Check for duplicate among active members in this group
    existing = [m for m in group.members if m.name.lower() == cleaned_name.lower() and getattr(m, 'is_active', True)]
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A member named '{cleaned_name}' already exists in this group."
        )

    # If an inactive member with the exact same name existed, reactivate them
    inactive = [m for m in group.members if m.name.lower() == cleaned_name.lower() and not getattr(m, 'is_active', True)]
    if inactive:
        member = inactive[0]
        member.is_active = True
        if payload.email:
            member.email = payload.email.strip()
        db.commit()
        db.refresh(member)
        return member

    new_member = GroupMember(
        group_id=group.id,
        name=cleaned_name,
        email=payload.email.strip() if payload.email else None,
        is_active=True,
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_member)
    return new_member


@router.delete("/groups/{group_id}", status_code=status.HTTP_200_OK)
def delete_group(
    group_id: int,
    force: bool = Query(False, description="Force delete group even if unsettled balances exist"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Delete an expense group and all associated expenses safely."""
    group = db.query(ExpenseGroup).filter(ExpenseGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if group.trip_id is not None and current_user:
        trip = db.query(Trip).filter(Trip.id == group.trip_id).first()
        if trip and trip.user_id and trip.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this group")

    # Safety check for unsettled balances
    if not force:
        expenses = db.query(Expense).filter(Expense.group_id == group_id).all()
        if expenses:
            members = db.query(GroupMember).filter(GroupMember.group_id == group_id).all()
            paid = {m.id: 0 for m in members}
            owed = {m.id: 0 for m in members}
            for exp in expenses:
                paid[exp.paid_by_id] = paid.get(exp.paid_by_id, 0) + exp.amount_minor
                for share in exp.shares:
                    owed[share.member_id] = owed.get(share.member_id, 0) + share.share_minor
            has_debt = any((paid.get(m.id, 0) - owed.get(m.id, 0)) != 0 for m in members)
            if has_debt:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot delete group with unsettled member balances. Settle all debts first or confirm with force=true."
                )

    group_name = group.name
    db.delete(group)
    db.commit()
    return {"status": "deleted", "id": group_id, "name": group_name}


@router.post("/groups/{group_id}/leave", status_code=status.HTTP_200_OK)
def leave_group(group_id: int, payload: GroupLeaveRequest, db: Session = Depends(get_db)):
    """Allow an ordinary member to safely leave a group if their balance is settled."""
    group = db.query(ExpenseGroup).filter(ExpenseGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.id == payload.member_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this group")

    if not getattr(member, 'is_active', True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Member has already left this group."
        )

    # Check outstanding net balance for this member
    expenses = db.query(Expense).filter(Expense.group_id == group_id).all()
    paid_minor = sum(exp.amount_minor for exp in expenses if exp.paid_by_id == member.id)
    owed_minor = db.query(func.sum(ExpenseShare.share_minor)).join(Expense).filter(
        Expense.group_id == group_id,
        ExpenseShare.member_id == member.id
    ).scalar() or 0
    net_minor = paid_minor - owed_minor

    if net_minor != 0:
        net_formatted = f"{group.currency} {abs(net_minor) / 100:.2f}"
        direction = "are owed" if net_minor > 0 else "owe"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot leave group with an active balance. You currently {direction} {net_formatted}. Please settle all balances first."
        )

    # Restriction: if group has multiple active members and this is the founding member
    active_members = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.is_active == True
    ).order_by(GroupMember.id.asc()).all()

    if len(active_members) > 1 and active_members[0].id == member.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The group creator cannot leave while other members remain. Please delete the group if you wish to disband it."
        )

    # Check if member has historical financial records
    has_paid = db.query(Expense).filter(Expense.paid_by_id == member.id).first() is not None
    has_shares = db.query(ExpenseShare).filter(ExpenseShare.member_id == member.id).first() is not None

    if has_paid or has_shares:
        # Preserve historical expenses and foreign keys without deleting
        member.is_active = False
    else:
        # Zero historical records — completely safe to remove
        db.delete(member)

    db.commit()
    return {"status": "left", "member_id": payload.member_id, "group_id": group_id}


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------

@router.get("/groups/{group_id}/expenses", response_model=List[ExpenseOut])
def list_expenses(group_id: int, db: Session = Depends(get_db)):
    return (
        db.query(Expense)
        .filter(Expense.group_id == group_id)
        .order_by(Expense.expense_date.desc(), Expense.id.desc())
        .all()
    )


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(expense_id: int, db: Session = Depends(get_db)):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    return exp


@router.post("/", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    group = db.query(ExpenseGroup).filter(ExpenseGroup.id == payload.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if group.trip_id is not None and current_user:
        trip = db.query(Trip).filter(Trip.id == group.trip_id).first()
        if trip and trip.user_id and trip.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to add expenses to this group",
            )

    members = db.query(GroupMember).filter(GroupMember.group_id == payload.group_id).all()
    member_map = {m.id: m for m in members}

    if payload.paid_by_id not in member_map:
        raise HTTPException(status_code=400, detail="paid_by_id is not a member of this group")

    payer = member_map[payload.paid_by_id]
    if not getattr(payer, 'is_active', True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The specified payer has left this group and cannot record new expenses."
        )

    # Inherit group's currency if payload left as default or not matching group
    currency = group.currency
    if payload.currency and payload.currency != "INR":
        currency = payload.currency.upper()

    expense = Expense(
        group_id=payload.group_id,
        paid_by_id=payload.paid_by_id,
        description=payload.description.strip(),
        amount_minor=payload.amount_minor,
        currency=currency,
        category=payload.category,
        split_method=payload.split_method,
        expense_date=payload.expense_date or date.today(),
        notes=payload.notes,
    )
    db.add(expense)
    db.flush()

    # Calculate and validate shares
    shares = _calculate_shares(
        expense_id=expense.id,
        amount_minor=payload.amount_minor,
        method=payload.split_method,
        members=members,
        custom_shares=payload.shares,
        participant_ids=payload.participant_ids,
    )
    for share in shares:
        db.add(share)

    db.commit()
    db.refresh(expense)
    return expense


@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")

    if exp.group and exp.group.trip_id is not None and current_user:
        trip = db.query(Trip).filter(Trip.id == exp.group.trip_id).first()
        if trip and trip.user_id and trip.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to modify this expense",
            )

    members = db.query(GroupMember).filter(GroupMember.group_id == exp.group_id).all()
    member_map = {m.id: m for m in members}

    if payload.paid_by_id is not None:
        if payload.paid_by_id not in member_map:
            raise HTTPException(status_code=400, detail="paid_by_id is not a member of this group")
        payer = member_map[payload.paid_by_id]
        if not getattr(payer, 'is_active', True):
            raise HTTPException(status_code=400, detail="Selected payer is no longer an active member of this group")
        exp.paid_by_id = payload.paid_by_id

    if payload.description is not None:
        exp.description = payload.description.strip()
    if payload.amount_minor is not None:
        exp.amount_minor = payload.amount_minor
    if payload.currency is not None:
        exp.currency = payload.currency.upper()
    if payload.category is not None:
        exp.category = payload.category
    if payload.split_method is not None:
        exp.split_method = payload.split_method
    if payload.expense_date is not None:
        exp.expense_date = payload.expense_date
    if payload.notes is not None:
        exp.notes = payload.notes

    # If amount, split_method, shares, or participant_ids are updated, recalculate shares
    if any(x is not None for x in [payload.amount_minor, payload.split_method, payload.shares, payload.participant_ids]):
        db.query(ExpenseShare).filter(ExpenseShare.expense_id == exp.id).delete()
        db.flush()
        new_shares = _calculate_shares(
            expense_id=exp.id,
            amount_minor=exp.amount_minor,
            method=exp.split_method,
            members=members,
            custom_shares=payload.shares,
            participant_ids=payload.participant_ids,
        )
        for s in new_shares:
            db.add(s)

    db.commit()
    db.refresh(exp)
    return exp


@router.delete("/{expense_id}", status_code=status.HTTP_200_OK)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")

    if exp.group and exp.group.trip_id is not None and current_user:
        trip = db.query(Trip).filter(Trip.id == exp.group.trip_id).first()
        if trip and trip.user_id and trip.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to delete this expense",
            )

    db.delete(exp)
    db.commit()
    return {"status": "deleted", "id": expense_id}


def _calculate_shares(
    expense_id: int,
    amount_minor: int,
    method: SplitMethod,
    members: list,
    custom_shares,
    participant_ids: Optional[List[int]] = None,
) -> list:
    """
    Return ExpenseShare objects with rigorous validation and rounding.
    Always ensures shares sum up exactly to amount_minor.
    """
    shares = []
    member_map = {m.id: m for m in members}

    # 1. Resolve participating members
    if participant_ids is not None:
        if len(participant_ids) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one participant must be selected for this expense."
            )
        # Validate that every participant_id is an actual member of this group
        unknown_ids = [pid for pid in participant_ids if pid not in member_map]
        if unknown_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Participant ID(s) {unknown_ids} are not members of this group."
            )
        # Check that participants haven't left the group
        inactive_members = [member_map[pid] for pid in participant_ids if not getattr(member_map[pid], 'is_active', True)]
        if inactive_members:
            names = ", ".join(m.name for m in inactive_members)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Member(s) [{names}] have left the group and cannot participate in new expenses."
            )
        # Deduplicate while preserving order
        deduped_ids = list(dict.fromkeys(participant_ids))
        participating_members = [member_map[pid] for pid in deduped_ids]
    else:
        # Default to all active members of the group
        participating_members = [m for m in members if getattr(m, 'is_active', True)]
        if not participating_members:
            participating_members = members

    n = len(participating_members)
    if n == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one active group member must participate in the expense."
        )

    # 2. Split calculation based on method
    if method == SplitMethod.EQUAL:
        base = amount_minor // n
        remainder = amount_minor - base * n
        for i, m in enumerate(participating_members):
            extra = 1 if i < remainder else 0
            shares.append(ExpenseShare(
                expense_id=expense_id,
                member_id=m.id,
                share_minor=base + extra,
            ))

    elif method == SplitMethod.EXACT:
        if not custom_shares:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Exact split method requires specifying exact share amounts for participants."
            )
        # Validate participants in custom shares
        share_member_ids = [s.member_id for s in custom_shares]
        if len(share_member_ids) != len(set(share_member_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate participants found in exact shares."
            )
        for s in custom_shares:
            if s.member_id not in member_map:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Participant ID {s.member_id} is not a member of this group."
                )
            if s.share_minor < 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Share amount cannot be negative."
                )

        total_exact = sum(s.share_minor for s in custom_shares)
        if total_exact != amount_minor:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Exact shares sum to {total_exact} ({total_exact / 100:.2f}), "
                    f"which does not match the expense amount {amount_minor} ({amount_minor / 100:.2f})."
                )
            )

        for s in custom_shares:
            shares.append(ExpenseShare(
                expense_id=expense_id,
                member_id=s.member_id,
                share_minor=s.share_minor,
            ))

    elif method == SplitMethod.PERCENTAGE:
        if not custom_shares:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Percentage split method requires specifying percentage shares for participants."
            )
        share_member_ids = [s.member_id for s in custom_shares]
        if len(share_member_ids) != len(set(share_member_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate participants found in percentage shares."
            )
        for s in custom_shares:
            if s.member_id not in member_map:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Participant ID {s.member_id} is not a member of this group."
                )
            if s.share_minor < 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Percentage cannot be negative."
                )

        total_pct = sum(s.share_minor for s in custom_shares)
        # Accept either integer whole percentages (summing to 100) or basis points (summing to 10000)
        if total_pct not in (100, 10000):
            current_display = f"{total_pct}%" if total_pct <= 100 else f"{total_pct / 100:.2f}%"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Percentages must total 100% (currently {current_display})."
            )

        pct_divisor = 10000 if total_pct == 10000 else 100
        calculated = []
        running = 0
        for i, s in enumerate(custom_shares):
            if i < len(custom_shares) - 1:
                val = round((s.share_minor * amount_minor) / pct_divisor)
                running += val
                calculated.append(val)
            else:
                calculated.append(amount_minor - running)

        for s, val in zip(custom_shares, calculated):
            shares.append(ExpenseShare(
                expense_id=expense_id,
                member_id=s.member_id,
                share_minor=val,
            ))

    elif method == SplitMethod.SHARES:
        if not custom_shares:
            return _calculate_shares(expense_id, amount_minor, SplitMethod.EQUAL, participating_members, None)
        total_shares = sum(s.share_minor for s in custom_shares)
        if total_shares <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Total shares must be greater than zero."
            )
        calculated = []
        running = 0
        for i, s in enumerate(custom_shares):
            if i < len(custom_shares) - 1:
                val = (s.share_minor * amount_minor) // total_shares
                running += val
                calculated.append(val)
            else:
                calculated.append(amount_minor - running)
        for s, val in zip(custom_shares, calculated):
            shares.append(ExpenseShare(
                expense_id=expense_id,
                member_id=s.member_id,
                share_minor=val,
            ))

    return shares


# ---------------------------------------------------------------------------
# Settlements & Debt Settlement
# ---------------------------------------------------------------------------

@router.post("/groups/{group_id}/settle", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def settle_debt(
    group_id: int,
    payload: SettleDebtRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Record a debt settlement payment between two group members.
    Updates group and individual balances and persists in expense history.
    """
    group = db.query(ExpenseGroup).filter(ExpenseGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if group.trip_id is not None and current_user:
        trip = db.query(Trip).filter(Trip.id == group.trip_id).first()
        if trip and trip.user_id and trip.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to settle debts in this group",
            )

    if payload.from_member_id == payload.to_member_id:
        raise HTTPException(status_code=400, detail="Payer and receiver cannot be the same member.")

    from_member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.id == payload.from_member_id
    ).first()
    to_member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.id == payload.to_member_id
    ).first()

    if not from_member:
        raise HTTPException(status_code=400, detail="from_member_id is not a member of this group")
    if not to_member:
        raise HTTPException(status_code=400, detail="to_member_id is not a member of this group")

    if payload.amount_minor <= 0:
        raise HTTPException(status_code=400, detail="Settlement amount must be positive.")

    # Create settlement expense: from_member paid, and to_member is the sole consumer
    expense = Expense(
        group_id=group_id,
        paid_by_id=from_member.id,
        description=f"Settlement: {from_member.name} paid {to_member.name}",
        amount_minor=payload.amount_minor,
        currency=group.currency,
        category="settlement",
        split_method=SplitMethod.EQUAL,
        expense_date=date.today(),
        notes=payload.notes or f"Direct settlement payment to clear balance.",
    )
    db.add(expense)
    db.flush()

    # The share belongs strictly to the receiver
    share = ExpenseShare(
        expense_id=expense.id,
        member_id=to_member.id,
        share_minor=payload.amount_minor,
    )
    db.add(share)

    db.commit()
    db.refresh(expense)
    return expense


@router.get("/groups/{group_id}/settlements", response_model=SettlementPlan)
def get_settlements(group_id: int, db: Session = Depends(get_db)):
    group = db.query(ExpenseGroup).filter(ExpenseGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    members = db.query(GroupMember).filter(GroupMember.group_id == group_id).all()
    expenses = db.query(Expense).filter(Expense.group_id == group_id).all()

    # Calculate net balances safely using .get() to avoid KeyErrors
    paid: dict[int, int] = {m.id: 0 for m in members}
    owed: dict[int, int] = {m.id: 0 for m in members}
    total_minor = 0

    for exp in expenses:
        paid[exp.paid_by_id] = paid.get(exp.paid_by_id, 0) + exp.amount_minor
        total_minor += exp.amount_minor
        for share in exp.shares:
            owed[share.member_id] = owed.get(share.member_id, 0) + share.share_minor

    member_map = {m.id: m for m in members}
    balances = []
    for m in members:
        p = paid.get(m.id, 0)
        o = owed.get(m.id, 0)
        net = p - o
        balances.append(MemberBalance(
            member_id=m.id,
            member_name=m.name,
            total_paid_minor=p,
            total_owed_minor=o,
            net_minor=net,
        ))

    # Debt simplification
    settlements = _simplify_debts(balances, group.currency, member_map)

    return SettlementPlan(
        group_id=group_id,
        currency=group.currency,
        balances=balances,
        settlements=settlements,
        total_expenses_minor=total_minor,
    )


def _simplify_debts(
    balances: list[MemberBalance], currency: str, member_map: dict
) -> list[Settlement]:
    """Greedy debt simplification — minimises number of transfers."""
    creditors = sorted(
        [(b.net_minor, b.member_id) for b in balances if b.net_minor > 0],
        reverse=True,
    )
    debtors = sorted(
        [(-b.net_minor, b.member_id) for b in balances if b.net_minor < 0],
        reverse=True,
    )

    settlements = []
    i, j = 0, 0
    while i < len(creditors) and j < len(debtors):
        credit_amt, creditor_id = creditors[i]
        debt_amt, debtor_id = debtors[j]
        transfer = min(credit_amt, debt_amt)

        if transfer > 0:
            creditor_member = member_map.get(creditor_id)
            debtor_member = member_map.get(debtor_id)
            creditor_name = creditor_member.name if creditor_member else f"Member #{creditor_id}"
            debtor_name = debtor_member.name if debtor_member else f"Member #{debtor_id}"

            settlements.append(Settlement(
                from_member_id=debtor_id,
                from_member_name=debtor_name,
                to_member_id=creditor_id,
                to_member_name=creditor_name,
                amount_minor=transfer,
                currency=currency,
            ))

        creditors[i] = (credit_amt - transfer, creditor_id)
        debtors[j] = (debt_amt - transfer, debtor_id)

        if creditors[i][0] == 0:
            i += 1
        if debtors[j][0] == 0:
            j += 1

    return settlements
