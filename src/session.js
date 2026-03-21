// In-memory session store
// Stores pending transactions and conversation state per user
const sessions = new Map()

// Session states
const STATE = {
  IDLE: 'idle',
  AWAITING_CONFIRM: 'awaiting_confirm',
  EDITING_AMOUNT: 'editing_amount',
  EDITING_DATE: 'editing_date',
  EDITING_NOTE: 'editing_note',
  EDITING_CATEGORY: 'editing_category',
  EDITING_TYPE: 'editing_type',
  // Manual entry states
  MANUAL_AMOUNT: 'manual_amount',
  MANUAL_TYPE: 'manual_type',
  MANUAL_CATEGORY: 'manual_category',
  MANUAL_DATE: 'manual_date',
  MANUAL_NOTE: 'manual_note',
}

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      state: STATE.IDLE,
      pending: null,
      editMessageId: null
    })
  }
  return sessions.get(chatId)
}

function setSession(chatId, data) {
  const existing = getSession(chatId)
  sessions.set(chatId, { ...existing, ...data })
}

function clearSession(chatId) {
  sessions.set(chatId, {
    state: STATE.IDLE,
    pending: null,
    editMessageId: null
  })
}

module.exports = { STATE, getSession, setSession, clearSession }
