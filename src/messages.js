// ─── Format currency ─────────────────────────────────────────────────────────
function formatINR(amount) {
  return `₹${Number(amount).toLocaleString('en-IN')}`
}

// ─── Format transaction preview message ──────────────────────────────────────
function formatTransactionPreview(parsed) {
  const emoji = parsed.type === 'income' ? '🟢' : '🔴'
  const typeLabel = parsed.type === 'income' ? 'Income' : 'Expense'

  return `${emoji} <b>Transaction Preview</b>

💰 Amount: <b>${formatINR(parsed.amount)}</b>
📂 Type: ${typeLabel}
🏷 Category: ${parsed.category}
📅 Date: ${parsed.date}
📝 Note: ${parsed.note || '—'}

Is this correct?`
}

// ─── Format saved transaction confirmation ────────────────────────────────────
function formatSavedTransaction(parsed) {
  const emoji = parsed.type === 'income' ? '🟢' : '🔴'

  return `✅ <b>Transaction Saved!</b>

${emoji} ${formatINR(parsed.amount)} — ${parsed.category}
📅 ${parsed.date}
📝 ${parsed.note || '—'}`
}

// ─── Format app notification (when added via web app) ────────────────────────
function formatAppNotification(transaction) {
  const emoji = transaction.type === 'income' ? '🟢' : '🔴'

  return `📱 <b>New Transaction via App</b>

${emoji} ${formatINR(transaction.amount)} — ${transaction.category}
📅 ${transaction.date}
📝 ${transaction.note || '—'}`
}

// ─── Format budget alert ──────────────────────────────────────────────────────
function formatBudgetAlert(alert) {
  if (alert.type === 'exceeded') {
    return `🚨 <b>Budget Exceeded!</b>

📂 Category: ${alert.category}
💸 Spent: ${formatINR(alert.spent)}
🎯 Budget: ${formatINR(alert.budget)}
📊 Used: ${alert.percentage}%

You've gone over your ${alert.category} budget for this month!`
  }

  return `⚠️ <b>Budget Warning!</b>

📂 Category: ${alert.category}
💸 Spent: ${formatINR(alert.spent)}
🎯 Budget: ${formatINR(alert.budget)}
📊 Used: ${alert.percentage}%

You're close to your ${alert.category} budget limit!`
}

// ─── Format balance summary ───────────────────────────────────────────────────
function formatBalance(summary, monthly = false) {
  const label = monthly ? 'This Month' : 'All Time'
  const savingsRate = summary.income > 0
    ? Math.round(((summary.income - summary.expense) / summary.income) * 100)
    : 0

  return `💰 <b>Balance Summary (${label})</b>

🟢 Income:  <b>${formatINR(summary.income)}</b>
🔴 Expense: <b>${formatINR(summary.expense)}</b>
🏦 Balance: <b>${formatINR(summary.balance)}</b>
📈 Savings Rate: ${savingsRate}%`
}

// ─── Format recent transactions ───────────────────────────────────────────────
function formatRecentTransactions(transactions) {
  if (!transactions.length) return '📭 No transactions found.'

  const list = transactions.map(t => {
    const emoji = t.type === 'income' ? '🟢' : '🔴'
    return `${emoji} <b>${formatINR(t.amount)}</b> — ${t.category}\n    📝 ${t.note || '—'} | 📅 ${t.date}`
  }).join('\n\n')

  return `📋 <b>Recent Transactions</b>\n\n${list}`
}

// ─── Format budget list ───────────────────────────────────────────────────────
function formatBudgets(budgets) {
  if (!budgets.length) return '📭 No budgets set for this month.\n\nGo to the app to create budgets!'

  const list = budgets.map(b => {
    let bar = ''
    const filled = Math.min(Math.round(b.percentage / 10), 10)
    for (let i = 0; i < 10; i++) bar += i < filled ? '█' : '░'

    let statusEmoji = '✅'
    if (b.percentage >= 100) statusEmoji = '🚨'
    else if (b.percentage >= 80) statusEmoji = '⚠️'

    return `${statusEmoji} <b>${b.category}</b>
[${bar}] ${b.percentage}%
${formatINR(b.spent)} / ${formatINR(b.amount)} (${formatINR(b.remaining)} left)`
  }).join('\n\n')

  return `📊 <b>This Month's Budgets</b>\n\n${list}`
}

module.exports = {
  formatINR,
  formatTransactionPreview,
  formatSavedTransaction,
  formatAppNotification,
  formatBudgetAlert,
  formatBalance,
  formatRecentTransactions,
  formatBudgets
}
