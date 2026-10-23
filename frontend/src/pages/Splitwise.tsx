import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Receipt, Plus, Users, Loader2, AlertCircle,
  ArrowRight, CheckCircle2, X, PiggyBank, TrendingUp, TrendingDown,
  MoreVertical, Trash2, LogOut, Edit2, AlertTriangle, Check, CheckSquare, Square,
  UserPlus, DollarSign,
} from 'lucide-react'
import {
  listGroups, createGroup, addMemberToGroup, listExpenses, createExpense, updateExpense, deleteExpense,
  deleteGroup, leaveGroup, settleDebt, getSettlements, getErrorMessage, listTrips,
} from '../services/api'
import type { ExpenseGroup, Expense, SettlementPlan, GroupMember, SplitMethod, Trip } from '../types'
import { formatMoney, formatDate } from '../utils/format'

// ── Expense category options ───────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  'food', 'accommodation', 'transport', 'sightseeing',
  'shopping', 'entertainment', 'health', 'settlement', 'other',
]

// ── Create Group modal ─────────────────────────────────────────────────────

function CreateGroupModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (g: ExpenseGroup) => void
}) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null)
  const [members, setMembers] = useState<string[]>(['', ''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listTrips().then(r => setTrips(r.data)).catch(() => {})
  }, [])

  const handleTripChange = (val: string) => {
    if (!val) {
      setSelectedTripId(null)
      return
    }
    const id = Number(val)
    setSelectedTripId(id)
    const matched = trips.find(t => t.id === id)
    if (matched && matched.currency) {
      setCurrency(matched.currency)
    }
  }

  const addMember = () => setMembers(m => [...m, ''])
  const removeMember = (i: number) => setMembers(m => m.filter((_, j) => j !== i))
  const updateMember = (i: number, v: string) =>
    setMembers(m => m.map((x, j) => (j === i ? v : x)))

  const handleSubmit = async () => {
    setError(null)
    if (!name.trim()) { setError('Group name is required'); return }
    const validMembers = members.map(m => m.trim()).filter(Boolean)
    if (validMembers.length < 2) { setError('Add at least 2 members'); return }
    const lowerNames = validMembers.map(m => m.toLowerCase())
    if (new Set(lowerNames).size !== validMembers.length) {
      setError('Member names must be unique within the group')
      return
    }

    setSaving(true)
    try {
      const res = await createGroup({
        name: name.trim(),
        currency,
        trip_id: selectedTripId ?? undefined,
        members: validMembers.map(m => ({ name: m })),
      })
      onCreated(res.data)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-md shadow-2xl" id="create-group-modal">
        <div className="flex items-center justify-between pb-4 border-b border-surface-100 dark:border-surface-700">
          <h2 className="text-base font-semibold text-surface-900 dark:text-slate-100">New Expense Group</h2>
          <button id="close-group-modal" onClick={onClose} className="btn-ghost p-1.5 rounded-lg text-surface-500 hover:text-surface-900">
            <X size={18} />
          </button>
        </div>
        <div className="py-4 space-y-4">
          <div>
            <label className="label" htmlFor="group-name">Group name *</label>
            <input id="group-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Goa Trip — March 2025" />
          </div>
          <div>
            <label className="label" htmlFor="group-trip-link">Link to Trip (Optional)</label>
            <select
              id="group-trip-link"
              className="input"
              value={selectedTripId ?? ''}
              onChange={e => handleTripChange(e.target.value)}
            >
              <option value="">No trip linked (standalone group)</option>
              {trips.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.currency} · budget {formatMoney(t.budget_minor, t.currency)})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-surface-400 mt-1">
              Linking connects group expenses directly to your trip's budget tracking.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="group-currency">Currency</label>
            <select id="group-currency" className="input" value={currency} onChange={e => setCurrency(e.target.value)}>
              {['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Members *</label>
            <div className="space-y-2">
              {members.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    id={`member-${i}`}
                    className="input"
                    value={m}
                    onChange={e => updateMember(i, e.target.value)}
                    placeholder={`Person ${i + 1}`}
                  />
                  {members.length > 2 && (
                    <button onClick={() => removeMember(i)} className="btn-ghost text-red-400 hover:text-red-600 p-2">
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button id="add-member-btn" onClick={addMember} className="btn-ghost text-sm mt-2 flex items-center gap-1.5">
              <Plus size={14} /> Add member
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              <AlertCircle size={15} /> {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t border-surface-100 dark:border-surface-700">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button id="save-group-btn" onClick={handleSubmit} disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {saving ? 'Saving…' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Member modal ───────────────────────────────────────────────────────

function AddMemberModal({
  group,
  onClose,
  onAdded,
}: {
  group: ExpenseGroup
  onClose: () => void
  onAdded: (m: GroupMember) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    const cleanedName = name.trim()
    if (!cleanedName) {
      setError('Member name is required')
      return
    }
    const exists = group.members.some(
      m => m.name.toLowerCase() === cleanedName.toLowerCase() && (m.is_active ?? true)
    )
    if (exists) {
      setError(`A member named "${cleanedName}" is already in this group.`)
      return
    }

    setSaving(true)
    try {
      const res = await addMemberToGroup(group.id, {
        name: cleanedName,
        email: email.trim() || undefined,
      })
      onAdded(res.data)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-sm shadow-2xl" id="add-member-modal">
        <div className="flex items-center justify-between pb-3 border-b border-surface-100 dark:border-surface-700">
          <h2 className="text-base font-semibold text-surface-900 dark:text-slate-100 flex items-center gap-2">
            <UserPlus size={18} className="text-accent-600 dark:text-teal-400" />
            Add Group Member
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg text-surface-500 hover:text-surface-900">
            <X size={18} />
          </button>
        </div>
        <div className="py-4 space-y-3">
          <div>
            <label className="label" htmlFor="new-member-name">Name *</label>
            <input
              id="new-member-name"
              className="input text-sm"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="new-member-email">Email (optional)</label>
            <input
              id="new-member-email"
              type="email"
              className="input text-sm"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. rahul@example.com"
            />
          </div>
          {error && (
            <div className="p-2.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-surface-100 dark:border-surface-700">
          <button onClick={onClose} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {saving ? 'Adding…' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Settle Up Modal ────────────────────────────────────────────────────────

function SettleUpModal({
  group,
  defaultFromId,
  defaultToId,
  defaultAmountMinor,
  onClose,
  onSettled,
}: {
  group: ExpenseGroup
  defaultFromId?: number
  defaultToId?: number
  defaultAmountMinor?: number
  onClose: () => void
  onSettled: (expense: Expense) => void
}) {
  const activeMembers = useMemo(() => group.members.filter(m => m.is_active ?? true), [group.members])

  const [fromId, setFromId] = useState<number>(
    defaultFromId ?? activeMembers[0]?.id ?? 0
  )
  const [toId, setToId] = useState<number>(
    defaultToId ?? (activeMembers[1]?.id ?? activeMembers[0]?.id ?? 0)
  )
  const [amount, setAmount] = useState<string>(
    defaultAmountMinor ? (defaultAmountMinor / 100).toFixed(2) : ''
  )
  const [notes, setNotes] = useState<string>('Payment to settle shared balance')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payerMember = activeMembers.find(m => m.id === fromId)
  const receiverMember = activeMembers.find(m => m.id === toId)

  const handleSubmit = async () => {
    setError(null)
    if (fromId === toId) {
      setError('Payer and receiver cannot be the same member')
      return
    }
    const num = parseFloat(amount)
    if (!amount || isNaN(num) || num <= 0) {
      setError('Please enter a valid positive settlement amount')
      return
    }

    setSaving(true)
    try {
      const res = await settleDebt(group.id, {
        from_member_id: fromId,
        to_member_id: toId,
        amount_minor: Math.round(num * 100),
        notes: notes.trim() || undefined,
      })
      onSettled(res.data)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-md shadow-2xl space-y-4" id="settle-modal">
        <div className="flex items-center justify-between pb-3 border-b border-surface-100 dark:border-surface-700">
          <div className="flex items-center gap-2">
            <DollarSign size={20} className="text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-semibold text-surface-900 dark:text-slate-100">
              Settle Debt / Record Payment
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg text-surface-500 hover:text-surface-900">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Payer (Who paid) *</label>
              <select
                value={fromId}
                onChange={e => setFromId(Number(e.target.value))}
                className="input text-xs"
                id="settle-from-select"
              >
                {activeMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Receiver (Paid to) *</label>
              <select
                value={toId}
                onChange={e => setToId(Number(e.target.value))}
                className="input text-xs"
                id="settle-to-select"
              >
                {activeMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Amount ({group.currency}) *</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="input text-sm font-semibold"
              id="settle-amount-input"
            />
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. UPI / Cash / Bank transfer reference"
              className="input text-xs"
              id="settle-notes-input"
            />
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
            <p className="font-medium">
              💡 Recording this settlement payment will credit <strong>{payerMember?.name ?? 'Payer'}</strong> and debit <strong>{receiverMember?.name ?? 'Receiver'}</strong>, clearing their shared debt in balances.
            </p>
          </div>

          {error && (
            <div className="p-2.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-surface-100 dark:border-surface-700">
          <button onClick={onClose} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
            id="confirm-settle-btn"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            {saving ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Expense Modal (Add & Edit with Participant Selection & Multiple Split Methods) ───

function ExpenseModal({
  group,
  expenseToEdit,
  onClose,
  onSaved,
  onDeleted,
}: {
  group: ExpenseGroup
  expenseToEdit?: Expense | null
  onClose: () => void
  onSaved: (e: Expense) => void
  onDeleted?: (expenseId: number) => void
}) {
  const isEditing = Boolean(expenseToEdit)
  const activeMembers = useMemo(() => {
    // If editing, include any member that already participated in this expense even if later marked inactive
    if (expenseToEdit && expenseToEdit.shares) {
      const shareMemberIds = new Set(expenseToEdit.shares.map(s => s.member_id))
      return group.members.filter(m => (m.is_active ?? true) || shareMemberIds.has(m.id))
    }
    return group.members.filter(m => m.is_active ?? true)
  }, [group.members, expenseToEdit])

  const [description, setDescription] = useState(expenseToEdit?.description ?? '')
  const [amount, setAmount] = useState(
    expenseToEdit ? (expenseToEdit.amount_minor / 100).toFixed(2) : ''
  )
  const [paidById, setPaidById] = useState<number>(
    expenseToEdit?.paid_by_id ?? activeMembers[0]?.id ?? 0
  )
  const [category, setCategory] = useState(expenseToEdit?.category ?? 'other')
  const [date, setDate] = useState(
    expenseToEdit?.expense_date ?? new Date().toISOString().split('T')[0]
  )
  const [notes, setNotes] = useState(expenseToEdit?.notes ?? '')

  // Split Method: 'equal' | 'exact' | 'percentage'
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(
    (expenseToEdit?.split_method as SplitMethod) || 'equal'
  )

  // Participant selection: 'everyone' vs 'selected'
  const initialParticipantIds = useMemo(() => {
    if (expenseToEdit && expenseToEdit.shares && expenseToEdit.shares.length > 0) {
      return expenseToEdit.shares.map(s => s.member_id)
    }
    return activeMembers.map(m => m.id)
  }, [expenseToEdit, activeMembers])

  const [splitMode, setSplitMode] = useState<'everyone' | 'selected'>(
    expenseToEdit && expenseToEdit.shares && expenseToEdit.shares.length < activeMembers.length
      ? 'selected'
      : 'everyone'
  )
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>(initialParticipantIds)

  // Custom shares maps: memberId -> string value in input
  const initialExactShares = useMemo(() => {
    const map: Record<number, string> = {}
    if (expenseToEdit && expenseToEdit.split_method === 'exact' && expenseToEdit.shares) {
      for (const s of expenseToEdit.shares) {
        map[s.member_id] = (s.share_minor / 100).toFixed(2)
      }
    }
    return map
  }, [expenseToEdit])

  const initialPctShares = useMemo(() => {
    const map: Record<number, string> = {}
    if (expenseToEdit && expenseToEdit.split_method === 'percentage' && expenseToEdit.shares) {
      const totalAmount = expenseToEdit.amount_minor
      for (const s of expenseToEdit.shares) {
        map[s.member_id] = totalAmount > 0 ? ((s.share_minor / totalAmount) * 100).toFixed(1) : '0'
      }
    }
    return map
  }, [expenseToEdit])

  const [exactShares, setExactShares] = useState<Record<number, string>>(initialExactShares)
  const [pctShares, setPctShares] = useState<Record<number, string>>(initialPctShares)

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Active participating members
  const participants = useMemo(() => {
    return splitMode === 'everyone'
      ? activeMembers
      : activeMembers.filter(m => selectedMemberIds.includes(m.id))
  }, [splitMode, activeMembers, selectedMemberIds])

  const parsedAmountMinor = Math.round((parseFloat(amount) || 0) * 100)
  const totalAmountMajor = parsedAmountMinor / 100

  // Calculations for Equal split
  const equalSharesPreview = useMemo(() => {
    const n = participants.length
    if (n === 0 || parsedAmountMinor <= 0) return []
    const base = Math.floor(parsedAmountMinor / n)
    const remainder = parsedAmountMinor - base * n
    return participants.map((m, idx) => ({
      member: m,
      shareMinor: base + (idx < remainder ? 1 : 0),
    }))
  }, [participants, parsedAmountMinor])

  // Calculations for Exact split
  const exactAllocated = useMemo(() => {
    let sum = 0
    for (const p of participants) {
      const val = parseFloat(exactShares[p.id] || '0')
      if (!isNaN(val)) sum += val
    }
    return Math.round(sum * 100) / 100
  }, [participants, exactShares])

  const exactDiff = Math.round((exactAllocated - totalAmountMajor) * 100) / 100

  // Calculations for Percentage split
  const pctAllocated = useMemo(() => {
    let sum = 0
    for (const p of participants) {
      const val = parseFloat(pctShares[p.id] || '0')
      if (!isNaN(val)) sum += val
    }
    return Math.round(sum * 10) / 10
  }, [participants, pctShares])

  const pctDiff = Math.round((100 - pctAllocated) * 10) / 10

  const toggleMember = (id: number) => {
    if (selectedMemberIds.includes(id)) {
      setSelectedMemberIds(selectedMemberIds.filter(mId => mId !== id))
    } else {
      setSelectedMemberIds([...selectedMemberIds, id])
    }
  }

  const selectAllMembers = () => {
    setSelectedMemberIds(activeMembers.map(m => m.id))
  }

  const deselectAllMembers = () => {
    setSelectedMemberIds([])
  }

  const handleExactShareChange = (memberId: number, val: string) => {
    setExactShares(prev => ({ ...prev, [memberId]: val }))
  }

  const handlePctShareChange = (memberId: number, val: string) => {
    setPctShares(prev => ({ ...prev, [memberId]: val }))
  }

  const handleSubmit = async () => {
    setError(null)
    if (!description.trim()) { setError('Description is required'); return }
    const amountNum = parseFloat(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError('Enter a valid positive expense amount')
      return
    }
    if (!paidById) { setError('Select who paid for this expense'); return }
    if (participants.length === 0) {
      setError('At least one participant must be included in the split')
      return
    }

    // Split method specific validations
    let customSharesPayload: { member_id: number; share_minor: number }[] | undefined = undefined

    if (splitMethod === 'exact') {
      if (Math.abs(exactDiff) > 0.01) {
        setError(
          `Exact shares sum to ${group.currency} ${exactAllocated.toFixed(2)}, which does not match the total expense of ${group.currency} ${totalAmountMajor.toFixed(2)}.`
        )
        return
      }
      customSharesPayload = participants.map(m => ({
        member_id: m.id,
        share_minor: Math.round(parseFloat(exactShares[m.id] || '0') * 100),
      }))
    } else if (splitMethod === 'percentage') {
      if (Math.abs(pctDiff) > 0.1) {
        setError(`Percentages must total 100% (currently ${pctAllocated.toFixed(1)}%).`)
        return
      }
      customSharesPayload = participants.map(m => ({
        member_id: m.id,
        share_minor: Math.round(parseFloat(pctShares[m.id] || '0') * 100), // basis points
      }))
    }

    setSaving(true)
    try {
      const payload = {
        group_id: group.id,
        paid_by_id: paidById,
        description: description.trim(),
        amount_minor: Math.round(amountNum * 100),
        currency: group.currency,
        category,
        split_method: splitMethod,
        expense_date: date,
        notes: notes.trim() || undefined,
        participant_ids: participants.map(m => m.id),
        shares: customSharesPayload,
      }

      if (isEditing && expenseToEdit) {
        const res = await updateExpense(expenseToEdit.id, payload)
        onSaved(res.data)
      } else {
        const res = await createExpense(payload)
        onSaved(res.data)
      }
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteExpense = async () => {
    if (!expenseToEdit) return
    if (!window.confirm(`Delete expense "${expenseToEdit.description}"? This will recalculate member balances.`)) return
    setDeleting(true)
    try {
      await deleteExpense(expenseToEdit.id)
      if (onDeleted) onDeleted(expenseToEdit.id)
    } catch (e) {
      setError(getErrorMessage(e))
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="card w-full max-w-lg shadow-2xl my-6" id="expense-modal">
        <div className="flex items-center justify-between pb-3 border-b border-surface-100 dark:border-surface-700">
          <div>
            <h2 className="text-base font-semibold text-surface-900 dark:text-slate-100">
              {isEditing ? 'Edit Expense' : 'Add Expense'}
            </h2>
            <p className="text-xs text-surface-500 dark:text-slate-400">{group.name}</p>
          </div>
          <button id="close-expense-modal" onClick={onClose} className="btn-ghost p-1.5 rounded-lg text-surface-500 hover:text-surface-900">
            <X size={18} />
          </button>
        </div>

        <div className="py-4 space-y-4 max-h-[72vh] overflow-y-auto pr-1">
          <div>
            <label className="label" htmlFor="expense-desc">Description *</label>
            <input
              id="expense-desc"
              className="input text-sm"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Seafood Dinner at Fisherman's Wharf"
              autoFocus={!isEditing}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="expense-amount">Total Amount ({group.currency}) *</label>
              <input
                id="expense-amount"
                type="number"
                min={0.01}
                step={0.01}
                className="input text-sm font-semibold"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="label" htmlFor="expense-date">Date *</label>
              <input
                id="expense-date"
                type="date"
                className="input text-sm"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="expense-paid-by">Paid by *</label>
              <select
                id="expense-paid-by"
                className="input text-sm"
                value={paidById}
                onChange={e => setPaidById(Number(e.target.value))}
              >
                {activeMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="expense-category">Category</label>
              <select
                id="expense-category"
                className="input text-sm"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Split Method & Participant Selection Section ── */}
          <div className="p-3.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-slate-800/70 space-y-3">
            {/* Split Method Tabs */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-surface-700 dark:text-slate-200">
                Split Method
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-surface-200/60 dark:bg-slate-700/60 p-1 rounded-xl text-xs">
                {(['equal', 'exact', 'percentage'] as const).map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setSplitMethod(method)}
                    className={`py-1.5 px-2 rounded-lg font-medium transition-all text-center ${
                      splitMethod === method
                        ? 'bg-white dark:bg-slate-600 text-surface-900 dark:text-slate-100 shadow-sm font-semibold'
                        : 'text-surface-600 dark:text-slate-400 hover:text-surface-900 dark:hover:text-slate-200'
                    }`}
                    id={`split-method-${method}`}
                  >
                    {method === 'equal' && 'Split Equally'}
                    {method === 'exact' && 'Exact Amounts'}
                    {method === 'percentage' && 'Percentages (%)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Subset Participants Filter */}
            <div className="pt-2 border-t border-surface-200 dark:border-surface-700 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-surface-700 dark:text-slate-300">
                  Participants ({participants.length} of {activeMembers.length} included)
                </label>
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setSplitMode('everyone')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      splitMode === 'everyone'
                        ? 'bg-accent-600 text-white font-semibold'
                        : 'text-surface-500 hover:text-surface-900'
                    }`}
                  >
                    Everyone
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitMode('selected')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      splitMode === 'selected'
                        ? 'bg-accent-600 text-white font-semibold'
                        : 'text-surface-500 hover:text-surface-900'
                    }`}
                  >
                    Select Subset
                  </button>
                </div>
              </div>

              {splitMode === 'selected' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-surface-500">
                    <span>Choose who participated in this expense:</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={selectAllMembers} className="hover:underline text-accent-600 dark:text-teal-400">
                        Select all
                      </button>
                      <span>·</span>
                      <button type="button" onClick={deselectAllMembers} className="hover:underline text-surface-400">
                        Deselect all
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {activeMembers.map(m => {
                      const isSelected = selectedMemberIds.includes(m.id)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleMember(m.id)}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs text-left transition-all ${
                            isSelected
                              ? 'bg-white dark:bg-slate-700 border-accent-400 text-surface-900 dark:text-slate-100 shadow-sm font-medium'
                              : 'bg-surface-100/60 dark:bg-slate-800/60 border-surface-200 dark:border-surface-700 text-surface-400 line-through'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            {isSelected ? (
                              <CheckSquare size={14} className="text-accent-600 dark:text-teal-400 flex-shrink-0" />
                            ) : (
                              <Square size={14} className="text-surface-400 flex-shrink-0" />
                            )}
                            <span className="truncate">{m.name}</span>
                          </span>
                          <span className="text-[10px] uppercase font-semibold text-surface-400 flex-shrink-0 ml-1">
                            {isSelected ? 'In' : 'Out'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Split Method Details & Live Calculations */}
            {participants.length === 0 ? (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-600 dark:text-red-300">
                Please select at least one participant for this expense.
              </div>
            ) : splitMethod === 'equal' ? (
              /* Equal Split Breakdown */
              equalSharesPreview.length > 0 && (
                <div className="pt-2 border-t border-surface-200 dark:border-surface-700 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-surface-700 dark:text-slate-300">
                    <span>Each person pays ({participants.length} shares):</span>
                    <span className="text-accent-700 dark:text-teal-300 font-bold">
                      ~{formatMoney(equalSharesPreview[0]?.shareMinor || 0, group.currency)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {equalSharesPreview.map(s => (
                      <span
                        key={s.member.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-700 border border-surface-200 dark:border-surface-600 text-[11px] text-surface-800 dark:text-slate-200"
                      >
                        {s.member.name}: <strong>{formatMoney(s.shareMinor, group.currency)}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )
            ) : splitMethod === 'exact' ? (
              /* Exact Amounts Inputs */
              <div className="pt-2 border-t border-surface-200 dark:border-surface-700 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-surface-700 dark:text-slate-300">
                    Enter Exact Amount per Person:
                  </span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                      Math.abs(exactDiff) < 0.01
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {Math.abs(exactDiff) < 0.01
                      ? `✓ Exact Match (${group.currency} ${totalAmountMajor.toFixed(2)})`
                      : exactDiff < 0
                      ? `Missing: ${group.currency} ${Math.abs(exactDiff).toFixed(2)}`
                      : `Over by: ${group.currency} ${exactDiff.toFixed(2)}`}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {participants.map(m => (
                    <div key={m.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white dark:bg-slate-700 border border-surface-200 dark:border-surface-600">
                      <span className="text-xs font-medium text-surface-800 dark:text-slate-200 truncate flex-1">
                        {m.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-surface-400">{group.currency}</span>
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          value={exactShares[m.id] ?? ''}
                          onChange={e => handleExactShareChange(m.id, e.target.value)}
                          placeholder="0.00"
                          className="input py-1 px-2 text-xs w-24 text-right font-semibold"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Percentage Split Inputs */
              <div className="pt-2 border-t border-surface-200 dark:border-surface-700 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-surface-700 dark:text-slate-300">
                    Enter Percentage per Person:
                  </span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                      Math.abs(pctDiff) < 0.1
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {Math.abs(pctDiff) < 0.1
                      ? '✓ 100.0% Total'
                      : pctDiff > 0
                      ? `Remaining: ${pctDiff.toFixed(1)}%`
                      : `Over: ${Math.abs(pctDiff).toFixed(1)}%`}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {participants.map(m => {
                    const memberPct = parseFloat(pctShares[m.id] || '0') || 0
                    const estimatedShare = totalAmountMajor * (memberPct / 100)
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white dark:bg-slate-700 border border-surface-200 dark:border-surface-600">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-surface-800 dark:text-slate-200 truncate">{m.name}</p>
                          <p className="text-[10px] text-surface-400">
                            ~{formatMoney(Math.round(estimatedShare * 100), group.currency)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step={0.1}
                            min={0}
                            max={100}
                            value={pctShares[m.id] ?? ''}
                            onChange={e => handlePctShareChange(m.id, e.target.value)}
                            placeholder="0"
                            className="input py-1 px-2 text-xs w-20 text-right font-semibold"
                          />
                          <span className="text-[11px] text-surface-400 font-semibold">%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="expense-notes">Notes (optional)</label>
            <input
              id="expense-notes"
              className="input text-xs"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Receipt number, tax breakdown, etc."
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-surface-100 dark:border-surface-700">
          {isEditing ? (
            <button
              type="button"
              onClick={handleDeleteExpense}
              disabled={deleting}
              className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 px-2 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
              id="delete-expense-btn"
            >
              <Trash2 size={14} />
              {deleting ? 'Deleting…' : 'Delete Expense'}
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
            <button
              id="save-expense-btn"
              onClick={handleSubmit}
              disabled={saving}
              className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Saving…' : isEditing ? 'Update Expense' : 'Save Expense'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Delete Group Confirmation Modal ────────────────────────────────────────

function DeleteGroupModal({
  group,
  settlements,
  onClose,
  onDeleted,
}: {
  group: ExpenseGroup
  settlements: SettlementPlan | null
  onClose: () => void
  onDeleted: (groupId: number) => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasPendingSettlements = settlements && settlements.settlements.length > 0

  const handleDelete = async () => {
    if (confirmText.trim().toLowerCase() !== group.name.trim().toLowerCase()) {
      setError(`Please type "${group.name}" exactly to confirm deletion.`)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await deleteGroup(group.id, hasPendingSettlements ?? false)
      onDeleted(group.id)
    } catch (e) {
      setError(getErrorMessage(e))
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-md shadow-2xl space-y-4" id="delete-group-modal">
        <div className="flex items-center gap-3 text-red-600 pb-2 border-b border-surface-100 dark:border-surface-700">
          <AlertTriangle size={22} className="flex-shrink-0" />
          <h2 className="text-base font-semibold text-surface-900 dark:text-slate-100">
            Delete Group: {group.name}
          </h2>
        </div>

        <div className="space-y-3 text-xs text-surface-600 dark:text-slate-300 leading-relaxed">
          <p>
            You are about to permanently delete this group and all its recorded expenses, member records, and settlement summaries.
          </p>

          {hasPendingSettlements && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1">
              <strong>⚠️ Active Unsettled Debts:</strong>
              <p>
                This group currently has <strong>{settlements.settlements.length} unsettled transfers</strong> totaling{' '}
                {formatMoney(
                  settlements.settlements.reduce((sum, s) => sum + s.amount_minor, 0),
                  group.currency
                )}. Deleting this group will erase these active tracking balances.
              </p>
            </div>
          )}

          <div>
            <label className="block text-surface-700 dark:text-slate-200 font-medium mb-1">
              Type <strong>{group.name}</strong> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={group.name}
              className="input text-xs"
              id="delete-group-confirm-input"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-surface-100 dark:border-surface-700">
          <button onClick={onClose} className="btn-secondary text-xs px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading || confirmText.trim().toLowerCase() !== group.name.trim().toLowerCase()}
            className="btn-danger text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
            id="confirm-delete-group-btn"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {loading ? 'Deleting…' : 'Delete Group'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Leave Group Confirmation Modal ──────────────────────────────────────────

function LeaveGroupModal({
  group,
  settlements,
  onClose,
  onLeft,
}: {
  group: ExpenseGroup
  settlements: SettlementPlan | null
  onClose: () => void
  onLeft: (groupId: number, memberId: number) => void
}) {
  const activeMembers = useMemo(() => group.members.filter(m => m.is_active ?? true), [group.members])
  const [selectedMemberId, setSelectedMemberId] = useState<number>(activeMembers[0]?.id ?? 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedBalance = settlements?.balances.find(b => b.member_id === selectedMemberId)

  const handleLeave = async () => {
    if (!selectedMemberId) return
    setLoading(true)
    setError(null)
    try {
      await leaveGroup(group.id, selectedMemberId)
      onLeft(group.id, selectedMemberId)
    } catch (e) {
      setError(getErrorMessage(e))
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-md shadow-2xl space-y-4" id="leave-group-modal">
        <div className="flex items-center gap-2.5 pb-2 border-b border-surface-100 dark:border-surface-700 text-surface-900 dark:text-slate-100 font-semibold">
          <LogOut size={18} className="text-accent-600 dark:text-teal-400" />
          <span>Leave Group: {group.name}</span>
        </div>

        <div className="space-y-3 text-xs text-surface-600 dark:text-slate-300 leading-relaxed">
          <p>
            Choose which member is leaving. Historical expenses you paid or were shared in will be preserved in the group history, but you will no longer be included in new bills.
          </p>

          <div>
            <label className="block font-medium text-surface-700 dark:text-slate-200 mb-1">
              Select Member:
            </label>
            <select
              value={selectedMemberId}
              onChange={e => setSelectedMemberId(Number(e.target.value))}
              className="input text-xs"
              id="leave-member-select"
            >
              {activeMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {selectedBalance && (
            <div className={`p-3 rounded-lg border text-xs ${
              selectedBalance.net_minor === 0
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 text-amber-800 dark:text-amber-300'
            }`}>
              <div className="font-semibold mb-0.5">Current Balance:</div>
              <div>
                {selectedBalance.net_minor === 0
                  ? '✓ All settled (₹0.00). You are eligible to safely leave.'
                  : `⚠️ Active balance: ${selectedBalance.net_minor > 0 ? 'You are owed' : 'You owe'} ${formatMoney(Math.abs(selectedBalance.net_minor), group.currency)}. Outstanding balances must be settled before leaving.`}
              </div>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-surface-100 dark:border-surface-700">
          <button onClick={onClose} className="btn-secondary text-xs px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={handleLeave}
            disabled={loading || (selectedBalance && selectedBalance.net_minor !== 0)}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
            id="confirm-leave-btn"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
            {loading ? 'Leaving…' : 'Confirm Leave'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Group detail panel ─────────────────────────────────────────────────────

function GroupPanel({
  group,
  onGroupDeleted,
  onMemberLeft,
  onGroupUpdated,
}: {
  group: ExpenseGroup
  onGroupDeleted: (id: number) => void
  onMemberLeft: (groupId: number, memberId: number) => void
  onGroupUpdated: () => void
}) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settlements, setSettlements] = useState<SettlementPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'expenses' | 'balances'>('expenses')

  // Modals state
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)
  const [showSettleModal, setShowSettleModal] = useState(false)
  const [settleModalProps, setSettleModalProps] = useState<{ fromId?: number; toId?: number; amountMinor?: number }>({})
  const [showMenu, setShowMenu] = useState(false)

  const loadData = () => {
    setLoading(true)
    Promise.all([
      listExpenses(group.id),
      getSettlements(group.id),
    ])
      .then(([expRes, settleRes]) => {
        setExpenses(expRes.data)
        setSettlements(settleRes.data)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [group.id])

  const handleExpenseSaved = (_savedExp: Expense) => {
    setShowExpenseModal(false)
    setEditingExpense(null)
    loadData()
  }

  const handleExpenseDeleted = (_expId: number) => {
    setShowExpenseModal(false)
    setEditingExpense(null)
    loadData()
  }

  const handleMemberAdded = (_newMember: GroupMember) => {
    setShowAddMemberModal(false)
    onGroupUpdated()
    loadData()
  }

  const handleSettled = (_settleExp: Expense) => {
    setShowSettleModal(false)
    loadData()
  }

  const totalSpent = settlements?.total_expenses_minor ?? 0
  const currency = group.currency
  const activeMembers = group.members.filter(m => m.is_active ?? true)

  return (
    <div className="card space-y-4" id={`group-panel-${group.id}`}>
      {/* Add / Edit Expense Modal */}
      {(showExpenseModal || editingExpense) && (
        <ExpenseModal
          group={group}
          expenseToEdit={editingExpense}
          onClose={() => {
            setShowExpenseModal(false)
            setEditingExpense(null)
          }}
          onSaved={handleExpenseSaved}
          onDeleted={handleExpenseDeleted}
        />
      )}

      {/* Settle Up Modal */}
      {showSettleModal && (
        <SettleUpModal
          group={group}
          defaultFromId={settleModalProps.fromId}
          defaultToId={settleModalProps.toId}
          defaultAmountMinor={settleModalProps.amountMinor}
          onClose={() => setShowSettleModal(false)}
          onSettled={handleSettled}
        />
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <AddMemberModal
          group={group}
          onClose={() => setShowAddMemberModal(false)}
          onAdded={handleMemberAdded}
        />
      )}

      {/* Delete Group Modal */}
      {showDeleteModal && (
        <DeleteGroupModal
          group={group}
          settlements={settlements}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={id => {
            setShowDeleteModal(false)
            onGroupDeleted(id)
          }}
        />
      )}

      {/* Leave Group Modal */}
      {showLeaveModal && (
        <LeaveGroupModal
          group={group}
          settlements={settlements}
          onClose={() => setShowLeaveModal(false)}
          onLeft={(gId, mId) => {
            setShowLeaveModal(false)
            onMemberLeft(gId, mId)
          }}
        />
      )}

      {/* Group header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-surface-900 dark:text-slate-100">{group.name}</h2>
          <p className="text-xs text-surface-500 dark:text-slate-400 mt-0.5">
            {activeMembers.length} active members · {group.currency} · Created {formatDate(group.created_at)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            id={`add-member-btn-${group.id}`}
            onClick={() => setShowAddMemberModal(true)}
            className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1"
          >
            <UserPlus size={13} /> Add Member
          </button>

          <button
            id={`settle-btn-${group.id}`}
            onClick={() => {
              setSettleModalProps({})
              setShowSettleModal(true)
            }}
            className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
          >
            <DollarSign size={13} /> Settle Debt
          </button>

          <button
            id={`add-expense-btn-${group.id}`}
            onClick={() => {
              setEditingExpense(null)
              setShowExpenseModal(true)
            }}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Expense
          </button>

          {/* Three-dot action menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg border border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-slate-700 text-surface-600 dark:text-slate-300"
              title="Group actions"
              aria-label="Group actions"
            >
              <MoreVertical size={16} />
            </button>

            {showMenu && (
              <div
                className="absolute right-0 mt-1 w-44 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-slate-800 shadow-xl z-30 py-1 text-xs"
                onMouseLeave={() => setShowMenu(false)}
              >
                <button
                  onClick={() => {
                    setShowMenu(false)
                    setShowLeaveModal(true)
                  }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-surface-100 dark:hover:bg-slate-700 text-surface-700 dark:text-slate-200"
                >
                  <LogOut size={14} className="text-surface-500" />
                  Leave Group
                </button>
                <div className="border-t border-surface-100 dark:border-surface-700 my-0.5" />
                <button
                  onClick={() => {
                    setShowMenu(false)
                    setShowDeleteModal(true)
                  }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 size={14} />
                  Delete Group
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Members chips */}
      <div className="flex flex-wrap gap-1.5">
        {group.members.map(m => {
          const isDeparted = m.is_active === false
          return (
            <span
              key={m.id}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                isDeparted
                  ? 'bg-surface-100/50 dark:bg-slate-800/40 text-surface-400 border-dashed border-surface-300 dark:border-surface-700'
                  : 'bg-surface-100 dark:bg-slate-800 text-surface-700 dark:text-slate-300 border-surface-200/50 dark:border-surface-700'
              }`}
            >
              <Users size={12} className={isDeparted ? 'text-surface-300' : 'text-surface-400'} />
              <span>{m.name}</span>
              {isDeparted && <span className="text-[10px] text-surface-400 italic">(Left)</span>}
            </span>
          )
        })}
      </div>

      {/* Summary Cards */}
      {!loading && settlements && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-surface-50 dark:bg-slate-800/60 border border-surface-200 dark:border-surface-700">
            <p className="text-xs text-surface-500 dark:text-slate-400">Total Group Spending</p>
            <p className="text-lg font-bold text-surface-900 dark:text-slate-100">{formatMoney(totalSpent, currency)}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-surface-50 dark:bg-slate-800/60 border border-surface-200 dark:border-surface-700">
            <p className="text-xs text-surface-500 dark:text-slate-400">Average Per Person</p>
            <p className="text-lg font-bold text-surface-900 dark:text-slate-100">
              {activeMembers.length > 0
                ? formatMoney(Math.round(totalSpent / activeMembers.length), currency)
                : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-100 dark:border-surface-700">
        {(['expenses', 'balances'] as const).map(t => (
          <button
            key={t}
            id={`tab-${t}-${group.id}`}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-150 -mb-px
              ${tab === t
                ? 'border-accent-600 text-accent-700 dark:text-teal-400 dark:border-teal-400'
                : 'border-transparent text-surface-500 dark:text-slate-400 hover:text-surface-700 dark:hover:text-slate-200'}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-surface-400 py-6 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading group details…
        </div>
      )}

      {/* Expenses tab */}
      {!loading && tab === 'expenses' && (
        <div className="space-y-2">
          {expenses.length === 0 ? (
            <div className="text-center py-8 space-y-2" id="expenses-empty">
              <PiggyBank size={28} className="text-surface-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm text-surface-500 dark:text-slate-400">No expenses yet. Add the first one!</p>
            </div>
          ) : (
            expenses.map(exp => {
              const paidBy = group.members.find(m => m.id === exp.paid_by_id)
              const participantCount = exp.shares?.length || group.members.length
              const isSettlement = exp.category === 'settlement'
              const isPartial = exp.shares && exp.shares.length > 0 && exp.shares.length < activeMembers.length

              return (
                <div
                  key={exp.id}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                    isSettlement
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/60'
                      : 'bg-white dark:bg-slate-800/50 border-surface-100 dark:border-surface-700 hover:border-surface-200 dark:hover:border-surface-600'
                  }`}
                  id={`expense-${exp.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-surface-900 dark:text-slate-100 truncate">{exp.description}</p>
                      {isSettlement ? (
                        <span className="badge bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 text-[10px] font-semibold">
                          ✓ Payment / Settlement
                        </span>
                      ) : (
                        <span className="badge bg-surface-100 dark:bg-slate-700 text-surface-700 dark:text-slate-300 text-[11px] capitalize">
                          {exp.category}
                        </span>
                      )}
                      {exp.split_method && exp.split_method !== 'equal' && (
                        <span className="badge bg-accent-50 dark:bg-teal-950 text-accent-700 dark:text-teal-300 border border-accent-200 dark:border-teal-800 text-[10px] capitalize">
                          {exp.split_method} Split
                        </span>
                      )}
                      {!isSettlement && isPartial && (
                        <span className="badge bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px]">
                          Split with {participantCount} of {activeMembers.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-surface-500 dark:text-slate-400 mt-0.5">
                      Paid by <strong className="text-surface-700 dark:text-slate-200">{paidBy?.name ?? `#${exp.paid_by_id}`}</strong> · {formatDate(exp.expense_date)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-surface-900 dark:text-slate-100">
                        {formatMoney(exp.amount_minor, exp.currency)}
                      </p>
                      {!isSettlement && (
                        <p className="text-[10px] text-surface-400">
                          {formatMoney(Math.round(exp.amount_minor / participantCount), exp.currency)} / person
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => setEditingExpense(exp)}
                      className="p-1.5 rounded-lg border border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-slate-700 text-surface-500 hover:text-surface-900 dark:hover:text-slate-100"
                      title="Edit expense"
                    >
                      <Edit2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Balances tab */}
      {!loading && tab === 'balances' && settlements && (
        <div className="space-y-4">
          {/* Per-member balances */}
          <div className="space-y-2">
            {settlements.balances.map(b => {
              const isPositive = b.net_minor > 0
              const isZero = b.net_minor === 0
              return (
                <div key={b.member_id} className="flex items-center justify-between p-3 rounded-xl border border-surface-100 dark:border-surface-700 bg-white dark:bg-slate-800/40" id={`balance-${b.member_id}`}>
                  <div>
                    <p className="text-sm font-semibold text-surface-900 dark:text-slate-100">{b.member_name}</p>
                    <p className="text-xs text-surface-500 dark:text-slate-400">
                      Paid {formatMoney(b.total_paid_minor, currency)} · Owes {formatMoney(b.total_owed_minor, currency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className={`flex items-center gap-1 text-sm font-bold
                      ${isZero ? 'text-surface-500 dark:text-slate-400' : isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      {!isZero && (isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />)}
                      {isZero ? 'Settled' : (isPositive ? '+' : '') + formatMoney(b.net_minor, currency)}
                    </div>
                    <p className="text-[11px] text-surface-400">
                      {isZero ? 'Zero balance' : isPositive ? 'gets back' : 'owes group'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Settlement transfers */}
          {settlements.settlements.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold text-surface-500 dark:text-slate-400 uppercase tracking-wider">
                Suggested Debt Settlements:
              </p>
              {settlements.settlements.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-accent-50/70 dark:bg-teal-950/40 border border-accent-200/60 dark:border-teal-800 text-xs"
                  id={`settlement-${i}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-surface-800 dark:text-slate-100">{s.from_member_name}</span>
                    <span className="text-surface-500">pays</span>
                    <ArrowRight size={13} className="text-accent-600 dark:text-teal-400 flex-shrink-0" />
                    <span className="font-semibold text-surface-800 dark:text-slate-100">{s.to_member_name}</span>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span className="font-bold text-sm text-accent-700 dark:text-teal-300">
                      {formatMoney(s.amount_minor, s.currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSettleModalProps({
                          fromId: s.from_member_id,
                          toId: s.to_member_id,
                          amountMinor: s.amount_minor,
                        })
                        setShowSettleModal(true)
                      }}
                      className="btn-primary text-[11px] py-1 px-2.5 rounded-lg flex items-center gap-1 shadow-sm"
                      id={`settle-btn-${i}`}
                    >
                      <CheckCircle2 size={13} /> Settle Up
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {settlements.settlements.length === 0 && expenses.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
              <span>All expenses are currently balanced and settled!</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Splitwise page ─────────────────────────────────────────────────────────

export default function Splitwise() {
  const [searchParams] = useSearchParams()
  const tripIdParam = searchParams.get('tripId')
  const [groups, setGroups] = useState<ExpenseGroup[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showGroupModal, setShowGroupModal] = useState(false)

  const loadGroups = (preferredId?: number) => {
    setLoading(true)
    setError(null)
    listGroups()
      .then(r => {
        setGroups(r.data)
        if (preferredId && r.data.some(g => g.id === preferredId)) {
          setSelectedId(preferredId)
        } else if (tripIdParam && r.data.some(g => g.trip_id === Number(tripIdParam))) {
          const tripGroup = r.data.find(g => g.trip_id === Number(tripIdParam))
          if (tripGroup) setSelectedId(tripGroup.id)
        } else if (r.data.length > 0 && (!selectedId || !r.data.some(g => g.id === selectedId))) {
          setSelectedId(r.data[0].id)
        }
      })
      .catch(e => setError(getErrorMessage(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadGroups() }, [])

  const handleGroupCreated = (g: ExpenseGroup) => {
    setGroups(prev => [g, ...prev])
    setSelectedId(g.id)
    setShowGroupModal(false)
  }

  const handleGroupDeleted = (deletedGroupId: number) => {
    const updated = groups.filter(g => g.id !== deletedGroupId)
    setGroups(updated)
    setSelectedId(updated.length > 0 ? updated[0].id : null)
  }

  const handleMemberLeft = (groupId: number, _memberId: number) => {
    loadGroups(groupId)
  }

  const handleGroupUpdated = () => {
    loadGroups(selectedId ?? undefined)
  }

  const selectedGroup = groups.find(g => g.id === selectedId) ?? null

  return (
    <div className="space-y-6 animate-fade-in">
      {showGroupModal && (
        <CreateGroupModal onClose={() => setShowGroupModal(false)} onCreated={handleGroupCreated} />
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Receipt size={24} className="text-accent-600 dark:text-teal-400" />
            Splitwise & Bill Splitting
          </h1>
          <p className="page-subtitle">Track, split, and settle shared travel costs with companions</p>
        </div>
        <button id="new-group-btn" onClick={() => setShowGroupModal(true)} className="btn-primary">
          <Plus size={16} /> New Group
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          <AlertCircle size={16} /> {error}
          <button onClick={() => loadGroups(selectedId ?? undefined)} className="ml-auto text-xs hover:underline">Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading && groups.length === 0 && (
        <div className="grid lg:grid-cols-4 gap-6">
          <div className="skeleton h-48 rounded-xl" />
          <div className="lg:col-span-3 skeleton h-48 rounded-xl" />
        </div>
      )}

      {/* Empty */}
      {!loading && groups.length === 0 && !error && (
        <div className="card flex flex-col items-center justify-center py-20 text-center gap-4" id="splitwise-empty">
          <div className="w-14 h-14 rounded-2xl bg-accent-50 dark:bg-teal-950 flex items-center justify-center">
            <Receipt size={26} className="text-accent-600 dark:text-teal-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-surface-900 dark:text-slate-100">No expense groups yet</h2>
            <p className="text-sm text-surface-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
              Create a group with your travel companions and start tracking shared expenses with custom member splitting.
            </p>
          </div>
          <button id="empty-new-group-btn" onClick={() => setShowGroupModal(true)} className="btn-primary">
            <Plus size={16} /> New Group
          </button>
        </div>
      )}

      {/* Main content */}
      {groups.length > 0 && (
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Group sidebar */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-surface-500 dark:text-slate-400 uppercase tracking-wider px-1">Your Groups</p>
            {groups.map(g => (
              <button
                key={g.id}
                id={`group-tab-${g.id}`}
                onClick={() => setSelectedId(g.id)}
                className={`w-full text-left px-3.5 py-3 rounded-xl text-sm transition-all duration-150 border cursor-pointer ${
                  selectedId === g.id
                    ? 'bg-accent-600 text-white border-accent-600 shadow-sm font-semibold'
                    : 'bg-white dark:bg-slate-800/80 border-surface-200 dark:border-surface-700 text-surface-800 dark:text-slate-200 hover:border-accent-300 dark:hover:border-teal-700 hover:bg-surface-50 dark:hover:bg-slate-700/60'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="font-semibold truncate">{g.name}</p>
                  {g.trip_id && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                      selectedId === g.id
                        ? 'bg-white/20 text-white'
                        : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    }`}>
                      Trip Linked
                    </span>
                  )}
                </div>
                <p className={`text-xs mt-0.5 ${selectedId === g.id ? 'text-accent-100' : 'text-surface-500 dark:text-slate-400'}`}>
                  {g.members.filter(m => m.is_active ?? true).length} members · {g.currency}
                </p>
              </button>
            ))}
          </div>

          {/* Group detail */}
          <div className="lg:col-span-3">
            {selectedGroup ? (
              <GroupPanel
                key={selectedGroup.id}
                group={selectedGroup}
                onGroupDeleted={handleGroupDeleted}
                onMemberLeft={handleMemberLeft}
                onGroupUpdated={handleGroupUpdated}
              />
            ) : (
              <div className="card text-center py-12 text-sm text-surface-500">Select a group</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}