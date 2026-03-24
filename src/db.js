const supabase = require('./supabase')

// ─── Get user by telegram_id ─────────────────────────────────────────────────
async function getUserByTelegramId(telegramId) {
  const { data } = await supabase
    .from('settings')
    .select('user_id, name, language')
    .eq('telegram_id', telegramId.toString())
    .single()
  return data
}

// ─── Get user by telegram chat_id (for notifications) ───────────────────────
async function getUserByChatId(chatId) {
  const { data } = await supabase
    .from('settings')
    .select('user_id, name, language, telegram_id')
    .eq('telegram_chat_id', chatId.toString())
    .single()
  return data
}

// ─── Save transaction ────────────────────────────────────────────────────────
async function saveTransaction(userId, parsed) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      amount: Number(parsed.amount),
      type: parsed.type || 'expense',
      category: parsed.category || 'Other',
      note: parsed.note || '',
      date: parsed.date || new Date().toISOString().split('T')[0],
    })
    .select()
    .single()

  return { data, error }
}

// ─── Get balance summary (all time) ─────────────────────────────────────────
async function getBalanceSummary(userId) {
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('amount, type')
    .eq('user_id', userId)

  if (error) throw error

  const income = (transactions || [])
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + Number(t.amount), 0)

  const expense = (transactions || [])
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0)

  return { income, expense, balance: income - expense }
}

// ─── Get this month's balance ─────────────────────────────────────────────────
// FIX: Use gte/lte date range instead of .like() which may fail on some Supabase configs
async function getMonthlyBalance(userId) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  // First day of current month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  // Last day of current month
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('amount, type, category')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)

  if (error) throw error

  const income = (transactions || [])
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + Number(t.amount), 0)

  const expense = (transactions || [])
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0)

  return { income, expense, balance: income - expense, transactions: transactions || [] }
}

// ─── Get recent transactions ─────────────────────────────────────────────────
async function getRecentTransactions(userId, limit = 5) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

// ─── Get budgets with spending ───────────────────────────────────────────────
async function getBudgetsWithSpending(userId) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthStr = `${year}-${String(month).padStart(2, '0')}`

  const startDate = `${monthStr}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`

  const { data: budgets } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .eq('month', monthStr)

  if (!budgets || budgets.length === 0) return []

  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, category')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('date', startDate)
    .lte('date', endDate)

  return budgets.map(budget => {
    const spent = (transactions || [])
      .filter(t => t.category === budget.category)
      .reduce((s, t) => s + Number(t.amount), 0)

    return {
      ...budget,
      spent,
      remaining: Number(budget.amount) - spent,
      percentage: Math.round((spent / Number(budget.amount)) * 100)
    }
  })
}

// ─── Check budget alerts after new transaction ───────────────────────────────
async function checkBudgetAlerts(userId, category) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthStr = `${year}-${String(month).padStart(2, '0')}`

  const startDate = `${monthStr}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`

  const { data: budget } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .eq('month', monthStr)
    .eq('category', category)
    .single()

  if (!budget) return null

  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .eq('category', category)
    .gte('date', startDate)
    .lte('date', endDate)

  const spent = (transactions || []).reduce((s, t) => s + Number(t.amount), 0)
  const percentage = Math.round((spent / Number(budget.amount)) * 100)

  if (percentage >= 100) {
    return { type: 'exceeded', category, spent, budget: budget.amount, percentage }
  } else if (percentage >= 80) {
    return { type: 'warning', category, spent, budget: budget.amount, percentage }
  }
  return null
}

// ─── Trigger budget alert via Next.js app ────────────────────────────────────
async function triggerBudgetAlert(userId) {
  try {
    const appUrl = process.env.APP_URL
    if (!appUrl || !process.env.WEBHOOK_SECRET) {
      console.warn('[BudgetAlert] Skipped: APP_URL or WEBHOOK_SECRET not set')
      return
    }
    const res = await fetch(`${appUrl}/api/notifications/budget-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': process.env.WEBHOOK_SECRET
      },
      body: JSON.stringify({ user_id: userId })
    })
    if (!res.ok) {
      console.error(`[BudgetAlert] HTTP ${res.status}: ${res.statusText}`)
      return
    }
    const data = await res.json()
    console.log('[BudgetAlert] Result:', data)
  } catch (err) {
    console.error('[BudgetAlert] Failed:', err.message)
  }
}

// ─── Get all users with telegram connected ───────────────────────────────────
async function getAllTelegramUsers() {
  const { data } = await supabase
    .from('settings')
    .select('user_id, telegram_chat_id, name')
    .not('telegram_chat_id', 'is', null)

  return data || []
}

module.exports = {
  getUserByTelegramId,
  getUserByChatId,
  saveTransaction,
  getBalanceSummary,
  getMonthlyBalance,
  getRecentTransactions,
  getBudgetsWithSpending,
  checkBudgetAlerts,
  triggerBudgetAlert,
  getAllTelegramUsers
}
