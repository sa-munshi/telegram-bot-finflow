require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const express = require('express')

const { parseTextWithAI, parsePhotoWithAI, downloadTelegramFile, getRateLimitStatus } = require('./ai')
const {
  getUserByTelegramId,
  saveTransaction,
  getBalanceSummary,
  getMonthlyBalance,
  getRecentTransactions,
  getBudgetsWithSpending,
  checkBudgetAlerts
} = require('./db')
const {
  formatTransactionPreview,
  formatSavedTransaction,
  formatAppNotification,
  formatBudgetAlert,
  formatBalance,
  formatRecentTransactions,
  formatBudgets
} = require('./messages')
const {
  confirmKeyboard,
  editFieldKeyboard,
  typeKeyboard,
  categoryKeyboard,
  mainMenuKeyboard,
  cancelKeyboard,
  backToPreviewKeyboard
} = require('./keyboards')
const { STATE, getSession, setSession, clearSession } = require('./session')

// ─── Init bot ─────────────────────────────────────────────────────────────────
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true })

console.log('🤖 FinFlow Bot started!')

// ─── Helper: send with HTML ───────────────────────────────────────────────────
async function send(chatId, text, options = {}) {
  return bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options })
}

// ─── Helper: edit message ─────────────────────────────────────────────────────
async function edit(chatId, messageId, text, options = {}) {
  try {
    return await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      ...options
    })
  } catch (e) {
    // Message might not have changed, ignore
  }
}

// ─── Helper: answer callback query ───────────────────────────────────────────
async function answer(callbackQueryId, text = '') {
  try {
    await bot.answerCallbackQuery(callbackQueryId, { text })
  } catch (e) {}
}

// ─── Helper: require connected account ───────────────────────────────────────
async function requireUser(chatId, telegramId) {
  const user = await getUserByTelegramId(telegramId)
  if (!user) {
    await send(chatId,
      '🔗 <b>Account not connected!</b>\n\nGo to FinFlow app → Settings → Connect Telegram\nThen enter your Chat ID: <b>' + chatId + '</b>'
    )
    return null
  }
  return user
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  const firstName = msg.from.first_name || 'there'

  await send(chatId,
    `👋 Hey <b>${firstName}</b>! Welcome to <b>FinFlow Bot</b>!\n\n` +
    `To connect your account:\n` +
    `1️⃣ Open the FinFlow app\n` +
    `2️⃣ Go to Settings → Connect Telegram\n` +
    `3️⃣ Enter your Chat ID: <b>${chatId}</b>\n\n` +
    `Once connected, you can:\n` +
    `💬 Send any text to add a transaction\n` +
    `📷 Send a photo/receipt to scan it\n` +
    `➕ Use /add for manual entry\n\n` +
    `<b>Commands:</b>\n` +
    `/balance — All time balance\n` +
    `/monthly — This month summary\n` +
    `/recent — Last 5 transactions\n` +
    `/budgets — Budget status\n` +
    `/add — Manual transaction entry\n` +
    `/menu — Show quick menu\n` +
    `/help — Show this message`
  )
})

// ─── /help ────────────────────────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id
  await send(chatId,
    `🆘 <b>FinFlow Bot Help</b>\n\n` +
    `<b>Add Transactions:</b>\n` +
    `• Just type naturally: "spent 500 on lunch"\n` +
    `• Send a receipt photo 📷\n` +
    `• Use /add for step-by-step entry\n\n` +
    `<b>Commands:</b>\n` +
    `/balance — All time balance\n` +
    `/monthly — This month summary\n` +
    `/recent — Last 5 transactions\n` +
    `/budgets — This month's budgets\n` +
    `/add — Manual entry (step by step)\n` +
    `/menu — Quick action menu\n\n` +
    `<b>Your Chat ID:</b> <code>${chatId}</code>`
  )
})

// ─── /menu ────────────────────────────────────────────────────────────────────
bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id
  await send(chatId, '📱 <b>FinFlow Quick Menu</b>\n\nWhat would you like to do?', {
    reply_markup: mainMenuKeyboard()
  })
})

// ─── /balance ─────────────────────────────────────────────────────────────────
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  const summary = await getBalanceSummary(user.user_id)
  await send(chatId, formatBalance(summary, false))
})

// ─── /monthly ─────────────────────────────────────────────────────────────────
bot.onText(/\/monthly/, async (msg) => {
  const chatId = msg.chat.id
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  const summary = await getMonthlyBalance(user.user_id)
  await send(chatId, formatBalance(summary, true))
})

// ─── /recent ──────────────────────────────────────────────────────────────────
bot.onText(/\/recent/, async (msg) => {
  const chatId = msg.chat.id
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  const transactions = await getRecentTransactions(user.user_id, 5)
  await send(chatId, formatRecentTransactions(transactions))
})

// ─── /budgets ─────────────────────────────────────────────────────────────────
bot.onText(/\/budgets/, async (msg) => {
  const chatId = msg.chat.id
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  const budgets = await getBudgetsWithSpending(user.user_id)
  await send(chatId, formatBudgets(budgets))
})

// ─── /limits — show usage ─────────────────────────────────────────────────────
bot.onText(/\/limits/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id.toString()
  const text = getRateLimitStatus(userId, 'text')
  const photo = getRateLimitStatus(userId, 'photo')

  await send(chatId,
    `📊 <b>Your Daily Usage</b>\n\n` +
    `💬 Text parsing: ${text.count}/${text.limit} used (${text.remaining} left)\n` +
    `📷 Photo scans: ${photo.count}/${photo.limit} used (${photo.remaining} left)\n\n` +
    `⏰ Resets every midnight`
  )
})


bot.onText(/\/add/, async (msg) => {
  const chatId = msg.chat.id
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  clearSession(chatId)
  setSession(chatId, {
    state: STATE.MANUAL_AMOUNT,
    pending: {}
  })

  await send(chatId,
    '➕ <b>Manual Transaction Entry</b>\n\nStep 1/5: Enter the <b>amount</b> (numbers only)\n\nExample: <code>500</code>',
    { reply_markup: cancelKeyboard() }
  )
})

// ─── Handle photos ────────────────────────────────────────────────────────────
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  const processingMsg = await send(chatId, '🔍 <b>Scanning your receipt...</b>\n\nThis may take a few seconds.')

  try {
    // Get highest resolution photo
    const photos = msg.photo
    const bestPhoto = photos[photos.length - 1]

    const fileData = await downloadTelegramFile(bestPhoto.file_id, process.env.TELEGRAM_BOT_TOKEN)
    if (!fileData) {
      await edit(chatId, processingMsg.message_id, '❌ Could not download the image. Please try again.')
      return
    }

    const parsed = await parsePhotoWithAI(fileData.base64, fileData.mimeType, msg.from.id.toString())

    if (parsed?.error === 'rate_limit') {
      await edit(chatId, processingMsg.message_id, `⛔ <b>Rate Limit Reached</b>\n\n${parsed.message}`)
      return
    }

    if (!parsed || !parsed.amount) {
      await edit(chatId, processingMsg.message_id,
        '❌ <b>Could not parse this image.</b>\n\nMake sure:\n• The receipt is clear and readable\n• Lighting is good\n• Try sending a cleaner photo\n\nOr type the transaction manually instead.'
      )
      return
    }

    setSession(chatId, {
      state: STATE.AWAITING_CONFIRM,
      pending: parsed,
      editMessageId: processingMsg.message_id
    })

    await edit(chatId, processingMsg.message_id,
      '📷 <b>Receipt Scanned!</b>\n\n' + formatTransactionPreview(parsed),
      { reply_markup: confirmKeyboard() }
    )
  } catch (err) {
    console.error('Photo handler error:', err)
    await edit(chatId, processingMsg.message_id, '❌ Something went wrong. Please try again.')
  }
})

// ─── Handle text messages ─────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return
  const chatId = msg.chat.id
  const text = msg.text.trim()
  const session = getSession(chatId)

  // ── Manual entry flow ──────────────────────────────────────────────────────
  if (session.state === STATE.MANUAL_AMOUNT) {
    const amount = parseFloat(text.replace(/[₹,\s]/g, ''))
    if (isNaN(amount) || amount <= 0) {
      await send(chatId, '❌ Invalid amount. Please enter a number like <code>500</code>', { reply_markup: cancelKeyboard() })
      return
    }
    setSession(chatId, {
      state: STATE.MANUAL_TYPE,
      pending: { ...session.pending, amount }
    })
    await send(chatId,
      `✅ Amount: <b>₹${amount.toLocaleString('en-IN')}</b>\n\nStep 2/5: Select the <b>type</b>`,
      { reply_markup: typeKeyboard() }
    )
    return
  }

  if (session.state === STATE.MANUAL_DATE) {
    // Accept YYYY-MM-DD or DD/MM/YYYY or "today"
    let date = text
    if (text.toLowerCase() === 'today') {
      date = new Date().toISOString().split('T')[0]
    } else if (text.includes('/')) {
      const parts = text.split('/')
      if (parts.length === 3) {
        date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
      }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await send(chatId, '❌ Invalid date. Use format <code>YYYY-MM-DD</code> or type <code>today</code>', { reply_markup: cancelKeyboard() })
      return
    }

    setSession(chatId, {
      state: STATE.MANUAL_NOTE,
      pending: { ...session.pending, date }
    })

    await send(chatId,
      `✅ Date: <b>${date}</b>\n\nStep 5/5: Add a <b>note</b> (or type <code>skip</code> to leave blank)`,
      { reply_markup: cancelKeyboard() }
    )
    return
  }

  if (session.state === STATE.MANUAL_NOTE) {
    const note = text.toLowerCase() === 'skip' ? '' : text
    const pending = { ...session.pending, note }

    setSession(chatId, {
      state: STATE.AWAITING_CONFIRM,
      pending
    })

    await send(chatId,
      '📝 <b>Almost done!</b>\n\n' + formatTransactionPreview(pending),
      { reply_markup: confirmKeyboard() }
    )
    return
  }

  // ── Edit flow ──────────────────────────────────────────────────────────────
  if (session.state === STATE.EDITING_AMOUNT) {
    const amount = parseFloat(text.replace(/[₹,\s]/g, ''))
    if (isNaN(amount) || amount <= 0) {
      await send(chatId, '❌ Invalid amount. Enter a number like <code>500</code>', { reply_markup: cancelKeyboard() })
      return
    }
    const pending = { ...session.pending, amount }
    setSession(chatId, { state: STATE.AWAITING_CONFIRM, pending })
    await send(chatId, '✅ Amount updated!\n\n' + formatTransactionPreview(pending), { reply_markup: confirmKeyboard() })
    return
  }

  if (session.state === STATE.EDITING_DATE) {
    let date = text
    if (text.toLowerCase() === 'today') date = new Date().toISOString().split('T')[0]
    const pending = { ...session.pending, date }
    setSession(chatId, { state: STATE.AWAITING_CONFIRM, pending })
    await send(chatId, '✅ Date updated!\n\n' + formatTransactionPreview(pending), { reply_markup: confirmKeyboard() })
    return
  }

  if (session.state === STATE.EDITING_NOTE) {
    const note = text.toLowerCase() === 'skip' ? '' : text
    const pending = { ...session.pending, note }
    setSession(chatId, { state: STATE.AWAITING_CONFIRM, pending })
    await send(chatId, '✅ Note updated!\n\n' + formatTransactionPreview(pending), { reply_markup: confirmKeyboard() })
    return
  }

  // ── Normal message → AI parse ──────────────────────────────────────────────
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  const processingMsg = await send(chatId, '🔄 <b>Processing...</b>')

  const parsed = await parseTextWithAI(text, msg.from.id.toString())

  if (parsed?.error === 'rate_limit') {
    await edit(chatId, processingMsg.message_id, `⛔ <b>Rate Limit Reached</b>\n\n${parsed.message}`)
    return
  }

  if (!parsed || !parsed.amount) {
    await edit(chatId, processingMsg.message_id,
      '❌ <b>Could not understand that.</b>\n\nTry:\n• "spent 500 on lunch"\n• "received 50000 salary"\n• "paid 1200 electricity bill"\n\nOr use /add for manual entry.'
    )
    return
  }

  setSession(chatId, {
    state: STATE.AWAITING_CONFIRM,
    pending: parsed,
    editMessageId: processingMsg.message_id
  })

  await edit(chatId, processingMsg.message_id,
    formatTransactionPreview(parsed),
    { reply_markup: confirmKeyboard() }
  )
})

// ─── Handle callback queries (button presses) ─────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id
  const messageId = query.message.message_id
  const data = query.data
  const session = getSession(chatId)

  await answer(query.id)

  // ── Menu actions ───────────────────────────────────────────────────────────
  if (data === 'menu_balance') {
    const user = await requireUser(chatId, query.from.id)
    if (!user) return
    const summary = await getBalanceSummary(user.user_id)
    await edit(chatId, messageId, formatBalance(summary, false), { reply_markup: mainMenuKeyboard() })
    return
  }

  if (data === 'menu_monthly') {
    const user = await requireUser(chatId, query.from.id)
    if (!user) return
    const summary = await getMonthlyBalance(user.user_id)
    await edit(chatId, messageId, formatBalance(summary, true), { reply_markup: mainMenuKeyboard() })
    return
  }

  if (data === 'menu_recent') {
    const user = await requireUser(chatId, query.from.id)
    if (!user) return
    const transactions = await getRecentTransactions(user.user_id)
    await edit(chatId, messageId, formatRecentTransactions(transactions), { reply_markup: mainMenuKeyboard() })
    return
  }

  if (data === 'menu_budgets') {
    const user = await requireUser(chatId, query.from.id)
    if (!user) return
    const budgets = await getBudgetsWithSpending(user.user_id)
    await edit(chatId, messageId, formatBudgets(budgets), { reply_markup: mainMenuKeyboard() })
    return
  }

  if (data === 'menu_manual') {
    clearSession(chatId)
    setSession(chatId, { state: STATE.MANUAL_AMOUNT, pending: {} })
    await edit(chatId, messageId,
      '➕ <b>Manual Transaction Entry</b>\n\nStep 1/5: Enter the <b>amount</b>\n\nExample: <code>500</code>',
      { reply_markup: cancelKeyboard() }
    )
    return
  }

  // ── Confirm save ───────────────────────────────────────────────────────────
  if (data === 'confirm_save') {
    const user = await requireUser(chatId, query.from.id)
    if (!user) return

    const pending = session.pending
    if (!pending) {
      await send(chatId, '❌ Session expired. Please try again.')
      clearSession(chatId)
      return
    }

    const { data: saved, error } = await saveTransaction(user.user_id, pending)

    if (error) {
      await edit(chatId, messageId, '❌ <b>Failed to save.</b> Please try again.')
      return
    }

    clearSession(chatId)
    await edit(chatId, messageId, formatSavedTransaction(pending))

    // Check budget alerts
    if (pending.type === 'expense') {
      const alert = await checkBudgetAlerts(user.user_id, pending.category)
      if (alert) {
        await send(chatId, formatBudgetAlert(alert))
      }
    }
    return
  }

  // ── Edit transaction ───────────────────────────────────────────────────────
  if (data === 'edit_transaction') {
    await edit(chatId, messageId,
      '✏️ <b>What would you like to edit?</b>',
      { reply_markup: editFieldKeyboard() }
    )
    return
  }

  if (data === 'edit_amount') {
    setSession(chatId, { state: STATE.EDITING_AMOUNT })
    await edit(chatId, messageId,
      '💰 Enter new <b>amount</b>:\n\nExample: <code>750</code>',
      { reply_markup: cancelKeyboard() }
    )
    return
  }

  if (data === 'edit_type') {
    setSession(chatId, { state: STATE.EDITING_TYPE })
    await edit(chatId, messageId, '📂 Select transaction <b>type</b>:', { reply_markup: typeKeyboard() })
    return
  }

  if (data === 'edit_category') {
    const type = session.pending?.type || 'expense'
    setSession(chatId, { state: STATE.EDITING_CATEGORY })
    await edit(chatId, messageId, '🏷 Select <b>category</b>:', { reply_markup: categoryKeyboard(type) })
    return
  }

  if (data === 'edit_date') {
    setSession(chatId, { state: STATE.EDITING_DATE })
    await edit(chatId, messageId,
      `📅 Enter new <b>date</b>:\n\nFormat: <code>YYYY-MM-DD</code> or type <code>today</code>`,
      { reply_markup: cancelKeyboard() }
    )
    return
  }

  if (data === 'edit_note') {
    setSession(chatId, { state: STATE.EDITING_NOTE })
    await edit(chatId, messageId,
      '📝 Enter new <b>note</b> (or type <code>skip</code>):',
      { reply_markup: cancelKeyboard() }
    )
    return
  }

  // ── Type selection ─────────────────────────────────────────────────────────
  if (data === 'type_expense' || data === 'type_income') {
    const type = data === 'type_expense' ? 'expense' : 'income'
    const pending = { ...session.pending, type }

    if (session.state === STATE.MANUAL_TYPE) {
      setSession(chatId, {
        state: STATE.MANUAL_CATEGORY,
        pending
      })
      await edit(chatId, messageId,
        `✅ Type: <b>${type}</b>\n\nStep 3/5: Select <b>category</b>`,
        { reply_markup: categoryKeyboard(type) }
      )
    } else {
      setSession(chatId, { state: STATE.AWAITING_CONFIRM, pending })
      await edit(chatId, messageId,
        '✅ Type updated!\n\n' + formatTransactionPreview(pending),
        { reply_markup: confirmKeyboard() }
      )
    }
    return
  }

  // ── Category selection ─────────────────────────────────────────────────────
  if (data.startsWith('cat_')) {
    const category = data.replace('cat_', '')
    const pending = { ...session.pending, category }

    if (session.state === STATE.MANUAL_CATEGORY) {
      setSession(chatId, {
        state: STATE.MANUAL_DATE,
        pending
      })
      await edit(chatId, messageId,
        `✅ Category: <b>${category}</b>\n\nStep 4/5: Enter the <b>date</b>\n\nFormat: <code>YYYY-MM-DD</code> or type <code>today</code>`,
        { reply_markup: cancelKeyboard() }
      )
    } else {
      setSession(chatId, { state: STATE.AWAITING_CONFIRM, pending })
      await edit(chatId, messageId,
        '✅ Category updated!\n\n' + formatTransactionPreview(pending),
        { reply_markup: confirmKeyboard() }
      )
    }
    return
  }

  // ── Back to preview ────────────────────────────────────────────────────────
  if (data === 'back_to_preview') {
    setSession(chatId, { state: STATE.AWAITING_CONFIRM })
    await edit(chatId, messageId,
      formatTransactionPreview(session.pending),
      { reply_markup: confirmKeyboard() }
    )
    return
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────
  if (data === 'cancel') {
    clearSession(chatId)
    await edit(chatId, messageId, '❌ <b>Cancelled.</b>\n\nSend a message to add a transaction or use /menu.')
    return
  }
})

// ─── Error handler ────────────────────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message)
})

module.exports = bot
