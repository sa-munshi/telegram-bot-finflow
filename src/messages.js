// ─── Format currency ─────────────────────────────────────────────────────────
function formatINR(amount) {
  return `₹${Number(amount).toLocaleString('en-IN')}`
}

// ─── Month abbreviations for date formatting ─────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Format date as "DD Mon" ──────────────────────────────────────────────────
function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

// ─── Format transaction preview message ──────────────────────────────────────
function formatTransactionPreview(parsed) {
  const typeLabel = parsed.type === 'income' ? 'Income' : 'Expense'

  return (
    `<pre>──────────────────────────\n` +
    `  ${formatINR(parsed.amount)}  |  ${typeLabel}\n` +
    `  Category:  ${parsed.category}\n` +
    `  Date:      ${parsed.date}\n` +
    `  Note:      ${parsed.note || '—'}\n` +
    `──────────────────────────</pre>`
  )
}

// ─── Format saved transaction confirmation ────────────────────────────────────
function formatSavedTransaction(parsed) {
  const typeLabel = parsed.type === 'income' ? 'Income' : 'Expense'

  return (
    `[SAVED]\n` +
    `<pre>──────────────────────────\n` +
    `${formatINR(parsed.amount)} — ${parsed.category}\n` +
    `${typeLabel}  ·  ${parsed.date}\n` +
    `Note: ${parsed.note || '—'}\n` +
    `──────────────────────────</pre>\n` +
    `Added to FinFlow`
  )
}

// ─── Format app notification (when added via web app) ────────────────────────
function formatAppNotification(transaction) {
  const typeLabel = transaction.type === 'income' ? 'Income' : 'Expense'

  return (
    `[APP]\n` +
    `${formatINR(transaction.amount)} — ${transaction.category}\n` +
    `${typeLabel}  ·  ${transaction.date}\n` +
    `Note: ${transaction.note || '—'}`
  )
}

// ─── Format budget alert ──────────────────────────────────────────────────────
function formatBudgetAlert(alert) {
  if (alert.type === 'exceeded') {
    return (
      `[BUDGET EXCEEDED]\n` +
      `<pre>─────────────────────────\n` +
      `Category:   ${alert.category}\n` +
      `Budget:     ${formatINR(alert.budget)}\n` +
      `Spent:      ${formatINR(alert.spent)}\n` +
      `Over by:    ${formatINR(alert.spent - Number(alert.budget))}\n` +
      `─────────────────────────</pre>`
    )
  }

  return (
    `[BUDGET WARNING]  ${alert.percentage}% used\n` +
    `<pre>─────────────────────────\n` +
    `Category:   ${alert.category}\n` +
    `Budget:     ${formatINR(alert.budget)}\n` +
    `Spent:      ${formatINR(alert.spent)}\n` +
    `Remaining:  ${formatINR(Number(alert.budget) - alert.spent)}\n` +
    `─────────────────────────</pre>`
  )
}

// ─── Format balance summary ───────────────────────────────────────────────────
function formatBalance(summary, monthly = false) {
  const label = monthly ? 'This Month' : 'All Time'
  const savingsRate = summary.income > 0
    ? Math.round(((summary.income - summary.expense) / summary.income) * 100)
    : 0

  return (
    `<b>Balance (${label})</b>\n\n` +
    `Income:   <b>${formatINR(summary.income)}</b>\n` +
    `Expense:  <b>${formatINR(summary.expense)}</b>\n` +
    `Balance:  <b>${formatINR(summary.balance)}</b>\n` +
    `Savings:  ${savingsRate}%`
  )
}

// ─── Format recent transactions ───────────────────────────────────────────────
function formatRecentTransactions(transactions) {
  if (!transactions.length) return 'No transactions found.'

  const list = transactions.map(t => {
    const sign = t.type === 'income' ? '+' : '−'
    const amount = formatINR(t.amount)
    const date = formatShortDate(t.date)
    return `${sign} ${amount}  ${t.category}  ${date}`
  }).join('\n')

  return `<b>Recent Transactions</b>\n<pre>───────────────────\n${list}</pre>`
}

// ─── Format budget list ───────────────────────────────────────────────────────
function formatBudgets(budgets) {
  if (!budgets.length) return 'No budgets set.\n\nGo to the FinFlow app to create budgets.'

  const list = budgets.map(b => {
    const status = b.percentage >= 100 ? '[EXCEEDED]' : b.percentage >= 80 ? '[WARNING]' : '[OK]'
    return `${status} ${b.category}\n${formatINR(b.spent)} / ${formatINR(b.amount)} (${b.percentage}%)`
  }).join('\n\n')

  return `<b>This Month's Budgets</b>\n\n${list}`
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
