// In-memory session store
// Stores pending transactions and conversation state per user
const sessions = new Map()

// Preview preference per user (chatId → boolean, default false)
const previewEnabled = new Map()

// Pending bulk transactions awaiting confirmation (chatId → array)
const pendingBulkMap = new Map()

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

// ─── Preview preference ───────────────────────────────────────────────────────
function getPreview(chatId) {
  return previewEnabled.get(String(chatId)) === true
}

function setPreview(chatId, enabled) {
  previewEnabled.set(String(chatId), Boolean(enabled))
}

// ─── Pending bulk transactions ────────────────────────────────────────────────
function getPendingBulk(chatId) {
  return pendingBulkMap.get(String(chatId)) || null
}

function setPendingBulk(chatId, transactions) {
  pendingBulkMap.set(String(chatId), transactions)
}

function clearPendingBulk(chatId) {
  pendingBulkMap.delete(String(chatId))
}

module.exports = {
  STATE, getSession, setSession, clearSession,
  getPreview, setPreview,
  getPendingBulk, setPendingBulk, clearPendingBulk
}
