// ─── Format currency ─────────────────────────────────────────────────────────
function formatINR(amount) {
  return `₹${Number(amount).toLocaleString('en-IN')}`
}

// ─── Month abbreviations for date formatting ─────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Format date as "DD Mon YYYY" ────────────────────────────────────────────
function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// ─── Type badge ───────────────────────────────────────────────────────────────
function typeBadge(type) {
  return type === 'income' ? '📈 Income' : '📉 Expense'
}

// ─── Format transaction preview message ──────────────────────────────────────
function formatTransactionPreview(parsed) {
  const sign = parsed.type === 'income' ? '+' : '-'
  const dateFormatted = formatShortDate(parsed.date)

  return (
    `🔍 <b>Review before saving</b>\n\n` +
    `<b>${sign}${formatINR(parsed.amount)}</b>  ·  ${typeBadge(parsed.type)}\n` +
    `🏷 <b>Category</b>  ${parsed.category}\n` +
    `📅 <b>Date</b>  ${dateFormatted}\n` +
    `📝 <b>Note</b>  ${parsed.note || '—'}\n\n` +
    `Tap <b>Save</b> to confirm or <b>Edit</b> to change details.`
  )
}

// ─── Format saved transaction confirmation ────────────────────────────────────
function formatSavedTransaction(parsed) {
  const sign = parsed.type === 'income' ? '+' : '-'
  const dateFormatted = formatShortDate(parsed.date)

  return (
    `✅ <b>Transaction Saved!</b>\n\n` +
    `<b>${sign}${formatINR(parsed.amount)}</b>  ·  ${typeBadge(parsed.type)}\n` +
    `🏷 ${parsed.category}  ·  📅 ${dateFormatted}\n` +
    (parsed.note ? `📝 ${parsed.note}\n` : '') +
    `\nSynced to FinFlow ✨`
  )
}

// ─── Format app notification (when added via web app) ────────────────────────
function formatAppNotification(transaction) {
  const sign = transaction.type === 'income' ? '+' : '-'
  const dateFormatted = formatShortDate(transaction.date)

  return (
    `🌐 <b>New entry from FinFlow app</b>\n\n` +
    `<b>${sign}${formatINR(transaction.amount)}</b>  ·  ${typeBadge(transaction.type)}\n` +
    `🏷 ${transaction.category}  ·  📅 ${dateFormatted}\n` +
    (transaction.note ? `📝 ${transaction.note}` : '')
  )
}

// ─── Format budget alert ──────────────────────────────────────────────────────
function formatBudgetAlert(alert) {
  if (alert.type === 'exceeded') {
    const over = Number(alert.spent) - Number(alert.budget)
    return (
      `🚨 <b>Budget Exceeded!</b>\n\n` +
      `You've gone over your <b>${alert.category}</b> budget.\n\n` +
      `📊 Limit: ${formatINR(alert.budget)}\n` +
      `📉 Spent: ${formatINR(alert.spent)}\n` +
      `⬆️ Over by: <b>${formatINR(over)}</b>\n\n` +
      `Consider reviewing your spending in the FinFlow app.`
    )
  }

  return (
    `⚠️ <b>Heads up — ${alert.percentage}% of budget used</b>\n\n` +
    `Your <b>${alert.category}</b> budget is running low.\n\n` +
    `📊 Limit: ${formatINR(alert.budget)}\n` +
    `📉 Spent: ${formatINR(alert.spent)}\n` +
    `🟡 Left: <b>${formatINR(Number(alert.budget) - alert.spent)}</b>`
  )
}

// ─── Format balance summary ───────────────────────────────────────────────────
function formatBalance(summary, monthly = false) {
  const label = monthly ? 'This Month' : 'All Time'
  const savingsRate = summary.income > 0
    ? Math.round(((summary.income - summary.expense) / summary.income) * 100)
    : 0
  const balanceSign = summary.balance >= 0 ? '+' : ''
  const savingsEmoji = savingsRate >= 50 ? '🟢' : savingsRate >= 20 ? '🟡' : '🔴'

  return (
    `📊 <b>Balance — ${label}</b>\n\n` +
    `📈 Income   <b>${formatINR(summary.income)}</b>\n` +
    `📉 Expense  <b>${formatINR(summary.expense)}</b>\n` +
    `───────────────\n` +
    `🏦 Net      <b>${balanceSign}${formatINR(summary.balance)}</b>\n` +
    `${savingsEmoji} Savings rate  <b>${savingsRate}%</b>`
  )
}

// ─── Format recent transactions ───────────────────────────────────────────────
function formatRecentTransactions(transactions) {
  if (!transactions || !transactions.length) {
    return `📭 <b>No transactions yet</b>\n\nStart by typing something like:\n<i>"spent 500 on lunch"</i> or send a receipt photo 📷`
  }

  const list = transactions.map((t, i) => {
    const sign = t.type === 'income' ? '▲' : '▼'
    const amount = formatINR(t.amount)
    const date = formatShortDate(t.date)
    const note = t.note ? ` · ${t.note}` : ''
    return `${sign} <b>${amount}</b>  ${t.category}${note}\n   <i>${date}</i>`
  }).join('\n\n')

  return `🕐 <b>Recent Transactions</b>\n\n${list}`
}

// ─── Format budget list ───────────────────────────────────────────────────────
function formatBudgets(budgets) {
  if (!budgets || !budgets.length) {
    return `📭 <b>No budgets set</b>\n\nOpen the FinFlow app to create monthly budgets and track your spending limits.`
  }

  const list = budgets.map(b => {
    const bar = buildProgressBar(b.percentage)
    const statusEmoji = b.percentage >= 100 ? '🔴' : b.percentage >= 80 ? '🟡' : '🟢'
    return (
      `${statusEmoji} <b>${b.category}</b>  ${b.percentage}%\n` +
      `${bar}\n` +
      `${formatINR(b.spent)} spent of ${formatINR(b.amount)}`
    )
  }).join('\n\n')

  return `📊 <b>This Month's Budgets</b>\n\n${list}`
}

// ─── Progress bar helper ─────────────────────────────────────────────────────
function buildProgressBar(percentage) {
  const filled = Math.min(Math.round(percentage / 10), 10)
  const empty = 10 - filled
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${Math.min(percentage, 100)}%`
}

// ─── Format bulk transaction preview ─────────────────────────────────────────
function formatBulkPreview(transactions) {
  const count = transactions.length
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0)
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + Number(t.amount), 0)

  const items = transactions.map((t, i) => {
    const sign = t.type === 'income' ? '▲' : '▼'
    const note = t.note ? `  <i>${t.note}</i>` : ''
    return `${i + 1}. ${sign} <b>${formatINR(t.amount)}</b>  ${t.category}${note}`
  }).join('\n')

  let msg = `📋 <b>${count} transaction${count !== 1 ? 's' : ''} detected</b>\n\n`
  msg += items + '\n\n'
  msg += `───────────────\n`
  if (totalExpense > 0) msg += `📉 Total out:  <b>${formatINR(totalExpense)}</b>\n`
  if (totalIncome > 0) msg += `📈 Total in:   <b>${formatINR(totalIncome)}</b>\n`
  msg += `\nTap <b>Save All</b> to add these to FinFlow.`
  return msg
}

// ─── Format bulk save confirmation ───────────────────────────────────────────
function formatBulkSummary(transactions, savedCount, failedCount) {
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0)
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + Number(t.amount), 0)

  const items = transactions.map((t, i) => {
    const sign = t.type === 'income' ? '▲' : '▼'
    const note = t.note ? `  <i>${t.note}</i>` : ''
    return `${sign} <b>${formatINR(t.amount)}</b>  ${t.category}${note}`
  }).join('\n')

  let msg = `✅ <b>${savedCount} transaction${savedCount !== 1 ? 's' : ''} saved to FinFlow!</b>\n\n`
  msg += items + '\n\n'
  msg += `───────────────\n`
  if (totalExpense > 0) msg += `📉 Total spent:  <b>${formatINR(totalExpense)}</b>\n`
  if (totalIncome > 0) msg += `📈 Total received: <b>${formatINR(totalIncome)}</b>\n`
  if (failedCount > 0) msg += `\n⚠️ ${failedCount} item${failedCount > 1 ? 's' : ''} could not be saved. Try again.`
  else msg += `\nAll done ✨`
  return msg
}

module.exports = {
  formatINR,
  formatTransactionPreview,
  formatSavedTransaction,
  formatAppNotification,
  formatBudgetAlert,
  formatBalance,
  formatRecentTransactions,
  formatBudgets,
  formatBulkPreview,
  formatBulkSummary
}
