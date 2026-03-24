require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')

const { parseTextWithAI, parsePhotoWithAI, downloadTelegramFile, getRateLimitStatus } = require('./ai')
const {
  getUserByTelegramId,
  saveTransaction,
  getBalanceSummary,
  getMonthlyBalance,
  getRecentTransactions,
  getBudgetsWithSpending,
  checkBudgetAlerts,
  triggerBudgetAlert
} = require('./db')
const {
  formatTransactionPreview,
  formatSavedTransaction,
  formatAppNotification,
  formatBudgetAlert,
  formatBalance,
  formatRecentTransactions,
  formatBudgets,
  formatBulkPreview,
  formatBulkSummary
} = require('./messages')
const {
  confirmKeyboard,
  confirmAllKeyboard,
  editFieldKeyboard,
  typeKeyboard,
  categoryKeyboard,
  mainMenuKeyboard,
  cancelKeyboard,
  backToPreviewKeyboard
} = require('./keyboards')
const {
  STATE,
  getSession, setSession, clearSession,
  getPreview, setPreview,
  getPendingBulk, setPendingBulk, clearPendingBulk
} = require('./session')
const supabase = require('./supabase')

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
    // Ignore "message not modified" errors
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
      `🔗 <b>Account not linked yet</b>\n\n` +
      `To get started:\n` +
      `1. Open the <b>FinFlow app</b>\n` +
      `2. Go to <b>Settings → Connect Telegram</b>\n` +
      `3. Enter your Chat ID: <code>${chatId}</code>`
    )
    return null
  }
  return user
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  const user = await getUserByTelegramId(msg.from.id)

  if (user) {
    await send(chatId,
      `👋 Welcome back, <b>${user.name || msg.from.first_name || 'there'}</b>!\n\n` +
      `Your FinFlow account is connected and ready.\n\n` +
      `Just type a transaction like <i>"spent 500 on lunch"</i> or send a receipt photo to get started.\n\n` +
      `Type <b>help</b> to see all commands.`
    )
  } else {
    await send(chatId,
      `👋 <b>Welcome to FinFlow Bot!</b>\n\n` +
      `Track your expenses by just chatting — no forms, no fuss.\n\n` +
      `🔗 <b>To link your account:</b>\n` +
      `1. Open the <b>FinFlow app</b>\n` +
      `2. Settings → Connect Telegram\n` +
      `3. Enter your Chat ID: <code>${chatId}</code>`
    )
  }
})

// ─── /help ────────────────────────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id
  await send(chatId,
    `📖 <b>FinFlow Bot — How it works</b>\n\n` +
    `<b>Add a transaction</b>\n` +
    `· Just type it — <i>"spent 500 on lunch"</i>\n` +
    `· Send multiple — <i>"lunch 200, auto 80, groceries 1200"</i>\n` +
    `· Take a photo of any receipt 📷\n` +
    `· Step-by-step with /add\n\n` +
    `<b>View your data</b>\n` +
    `· <b>balance</b> — overall income vs expense\n` +
    `· <b>monthly</b> — this month's summary\n` +
    `· <b>recent</b> — last 5 transactions\n\n` +
    `<b>Settings</b>\n` +
    `· <b>preview on/off</b> — review before saving\n` +
    `· <b>disconnect</b> — unlink this account\n` +
    `· /limits — check daily usage\n\n` +
    `<i>Works in English, Hindi, Bengali and more 🇮🇳</i>`
  )
})

// ─── /disconnect ──────────────────────────────────────────────────────────────
bot.onText(/\/disconnect/, async (msg) => {
  const chatId = msg.chat.id
  const { error } = await supabase
    .from('settings')
    .update({ telegram_id: null, telegram_chat_id: null })
    .eq('telegram_id', msg.from.id.toString())

  if (error) {
    await send(chatId, `❌ Something went wrong while disconnecting. Please try again.`)
    return
  }

  await send(chatId, `👋 <b>Account disconnected</b>\n\nYour data is safe in FinFlow. You can reconnect anytime via Settings.`)
})

// ─── /recent ──────────────────────────────────────────────────────────────────
bot.onText(/\/recent/, async (msg) => {
  const chatId = msg.chat.id
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  try {
    const transactions = await getRecentTransactions(user.user_id, 5)
    await send(chatId, formatRecentTransactions(transactions))
  } catch (err) {
    console.error('Recent error:', err.message)
    await send(chatId, `❌ Couldn't fetch your transactions right now. Please try again.`)
  }
})

// ─── /limits — show usage ─────────────────────────────────────────────────────
bot.onText(/\/limits/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id.toString()
  const textStats = getRateLimitStatus(userId, 'text')
  const photoStats = getRateLimitStatus(userId, 'photo')

  const textBar = buildMiniBar(textStats.remaining, textStats.limit)
  const photoBar = buildMiniBar(photoStats.remaining, photoStats.limit)

  await send(chatId,
    `📊 <b>Daily Usage</b>\n\n` +
    `✍️ Text entries   <b>${textStats.remaining}/${textStats.limit}</b>\n` +
    `${textBar}\n\n` +
    `📷 Receipt scans  <b>${photoStats.remaining}/${photoStats.limit}</b>\n` +
    `${photoBar}\n\n` +
    `<i>Resets at midnight every day</i>`
  )
})

function buildMiniBar(remaining, limit) {
  const used = limit - remaining
  const filled = Math.round((used / limit) * 8)
  const empty = 8 - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

// ─── /add — manual entry ──────────────────────────────────────────────────────
bot.onText(/\/add/, async (msg) => {
  const chatId = msg.chat.id
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  clearSession(chatId)
  setSession(chatId, { state: STATE.MANUAL_AMOUNT, pending: {} })

  await send(chatId,
    `✍️ <b>Manual Entry — Step 1 of 4</b>\n\n` +
    `How much did you spend or receive?\n\n` +
    `Example: <code>500</code> or <code>1200.50</code>`,
    { reply_markup: cancelKeyboard() }
  )
})

// ─── Handle photos ────────────────────────────────────────────────────────────
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  const processingMsg = await send(chatId, `📷 <b>Scanning receipt...</b>\n\n<i>Reading the details, just a moment.</i>`)

  try {
    const photos = msg.photo
    const bestPhoto = photos[photos.length - 1]

    const fileData = await downloadTelegramFile(bestPhoto.file_id, process.env.TELEGRAM_BOT_TOKEN)
    if (!fileData) {
      await edit(chatId, processingMsg.message_id, `❌ <b>Couldn't read the image</b>\n\nPlease try again with a clearer photo.`)
      return
    }

    const parsed = await parsePhotoWithAI(fileData.base64, fileData.mimeType, msg.from.id.toString())

    if (parsed?.error === 'rate_limit') {
      await edit(chatId, processingMsg.message_id,
        `⛔ <b>Daily scan limit reached</b>\n\n${parsed.message}\n\nYou can still add transactions by typing them out.`
      )
      return
    }

    // ── Bulk array result ─────────────────────────────────────────────────────
    if (Array.isArray(parsed) && parsed.length > 0) {
      if (!getPreview(chatId)) {
        let savedCount = 0
        let failedCount = 0
        for (const txn of parsed) {
          try {
            const { error } = await saveTransaction(user.user_id, txn)
            if (error) failedCount++
            else savedCount++
          } catch (e) {
            failedCount++
          }
        }
        await edit(chatId, processingMsg.message_id,
          `📷 <b>Receipt scanned!</b>\n\n` + formatBulkSummary(parsed, savedCount, failedCount)
        )
        const hasExpenses = parsed.some(t => t.type === 'expense')
        if (hasExpenses) await triggerBudgetAlert(user.user_id)
      } else {
        setPendingBulk(chatId, parsed)
        await edit(chatId, processingMsg.message_id,
          `📷 <b>Receipt scanned!</b>\n\n` + formatBulkPreview(parsed),
          { reply_markup: confirmAllKeyboard() }
        )
      }
      return
    }

    // ── Single result ─────────────────────────────────────────────────────────
    if (!parsed || !parsed.amount) {
      await edit(chatId, processingMsg.message_id,
        `❌ <b>Couldn't read this receipt</b>\n\n` +
        `Make sure the image is:\n` +
        `• Clear and well-lit\n` +
        `• Not blurry or cropped\n\n` +
        `Or type the transaction manually instead.`
      )
      return
    }

    if (!getPreview(chatId)) {
      const { error } = await saveTransaction(user.user_id, parsed)
      if (error) {
        await edit(chatId, processingMsg.message_id, `❌ Failed to save. Please try again.`)
        return
      }
      await edit(chatId, processingMsg.message_id,
        `📷 <b>Receipt scanned!</b>\n\n` + formatSavedTransaction(parsed)
      )
      if (parsed.type === 'expense') {
        const alert = await checkBudgetAlerts(user.user_id, parsed.category)
        if (alert) await send(chatId, formatBudgetAlert(alert))
        await triggerBudgetAlert(user.user_id)
      }
    } else {
      setSession(chatId, {
        state: STATE.AWAITING_CONFIRM,
        pending: parsed,
        editMessageId: processingMsg.message_id
      })
      await edit(chatId, processingMsg.message_id,
        `📷 <b>Receipt scanned!</b>\n\n` + formatTransactionPreview(parsed),
        { reply_markup: confirmKeyboard() }
      )
    }
  } catch (err) {
    console.error('Photo handler error:', err)
    await edit(chatId, processingMsg.message_id, `❌ Something went wrong. Please try again.`)
  }
})

// ─── Handle text messages ─────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return
  const chatId = msg.chat.id
  const text = msg.text.trim()
  const textLower = text.toLowerCase()
  const session = getSession(chatId)

  // ── Preview toggle ─────────────────────────────────────────────────────────
  if (textLower === 'preview on') {
    setPreview(chatId, true)
    await send(chatId,
      `👁 <b>Preview mode on</b>\n\nYou'll see every transaction before it's saved. Great for double-checking!\n\nSend <b>preview off</b> to disable.`
    )
    return
  }

  if (textLower === 'preview off') {
    setPreview(chatId, false)
    await send(chatId,
      `⚡ <b>Preview mode off</b>\n\nTransactions now save instantly — fast and seamless.\n\nSend <b>preview on</b> to enable review.`
    )
    return
  }

  // ── Help ───────────────────────────────────────────────────────────────────
  if (textLower === 'help') {
    await send(chatId,
      `📖 <b>FinFlow Bot — How it works</b>\n\n` +
      `<b>Add a transaction</b>\n` +
      `· Just type it — <i>"spent 500 on lunch"</i>\n` +
      `· Send multiple — <i>"lunch 200, auto 80, groceries 1200"</i>\n` +
      `· Take a photo of any receipt 📷\n` +
      `· Step-by-step with /add\n\n` +
      `<b>View your data</b>\n` +
      `· <b>balance</b> — overall income vs expense\n` +
      `· <b>monthly</b> — this month's summary\n` +
      `· <b>recent</b> — last 5 transactions\n\n` +
      `<b>Settings</b>\n` +
      `· <b>preview on/off</b> — review before saving\n` +
      `· <b>disconnect</b> — unlink this account\n` +
      `· /limits — check daily usage\n\n` +
      `<i>Works in English, Hindi, Bengali and more 🇮🇳</i>`
    )
    return
  }

  // ── Balance commands ───────────────────────────────────────────────────────
  if (textLower === 'balance') {
    const user = await requireUser(chatId, msg.from.id)
    if (!user) return
    try {
      const summary = await getBalanceSummary(user.user_id)
      await send(chatId, formatBalance(summary, false))
    } catch (err) {
      console.error('Balance error:', err.message)
      await send(chatId, `❌ Couldn't fetch your balance right now. Please try again.`)
    }
    return
  }

  if (textLower === 'monthly') {
    const user = await requireUser(chatId, msg.from.id)
    if (!user) return
    try {
      const summary = await getMonthlyBalance(user.user_id)
      await send(chatId, formatBalance(summary, true))
    } catch (err) {
      console.error('Monthly error:', err.message)
      await send(chatId, `❌ Couldn't fetch this month's data. Please try again.`)
    }
    return
  }

  if (textLower === 'recent') {
    const user = await requireUser(chatId, msg.from.id)
    if (!user) return
    try {
      const transactions = await getRecentTransactions(user.user_id, 5)
      await send(chatId, formatRecentTransactions(transactions))
    } catch (err) {
      console.error('Recent error:', err.message)
      await send(chatId, `❌ Couldn't fetch recent transactions. Please try again.`)
    }
    return
  }

  if (textLower === 'disconnect') {
    try {
      const { error } = await supabase
        .from('settings')
        .update({ telegram_id: null, telegram_chat_id: null })
        .eq('telegram_id', msg.from.id.toString())
      if (error) throw error
      await send(chatId, `👋 <b>Account disconnected</b>\n\nYour data is safe in FinFlow. Reconnect anytime via Settings.`)
    } catch (err) {
      console.error('Disconnect error:', err.message)
      await send(chatId, `❌ Couldn't disconnect right now. Please try again.`)
    }
    return
  }

  // ── Manual entry flow ──────────────────────────────────────────────────────
  if (session.state === STATE.MANUAL_AMOUNT) {
    const amount = parseFloat(text.replace(/[₹,\s]/g, ''))
    if (isNaN(amount) || amount <= 0) {
      await send(chatId,
        `❌ That doesn't look like a valid amount.\n\nPlease enter a number like <code>500</code> or <code>1200.50</code>`,
        { reply_markup: cancelKeyboard() }
      )
      return
    }
    setSession(chatId, { state: STATE.MANUAL_TYPE, pending: { ...session.pending, amount } })
    await send(chatId,
      `✍️ <b>Step 2 of 4 — Type</b>\n\nAmount: <b>₹${amount.toLocaleString('en-IN')}</b>\n\nIs this money going out or coming in?`,
      { reply_markup: typeKeyboard() }
    )
    return
  }

  if (session.state === STATE.MANUAL_NOTE) {
    const note = text.toLowerCase() === 'skip' ? '' : text
    const pending = { ...session.pending, note }
    setSession(chatId, { state: STATE.AWAITING_CONFIRM, pending })
    await send(chatId, formatTransactionPreview(pending), { reply_markup: confirmKeyboard() })
    return
  }

  // ── Edit flow ──────────────────────────────────────────────────────────────
  if (session.state === STATE.EDITING_AMOUNT) {
    const amount = parseFloat(text.replace(/[₹,\s]/g, ''))
    if (isNaN(amount) || amount <= 0) {
      await send(chatId, `❌ Invalid amount. Try something like <code>750</code>`, { reply_markup: cancelKeyboard() })
      return
    }
    const pending = { ...session.pending, amount }
    setSession(chatId, { state: STATE.AWAITING_CONFIRM, pending })
    await send(chatId, `✅ Amount updated!\n\n` + formatTransactionPreview(pending), { reply_markup: confirmKeyboard() })
    return
  }

  if (session.state === STATE.EDITING_DATE) {
    let date = text
    if (text.toLowerCase() === 'today') date = new Date().toISOString().split('T')[0]
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      await send(chatId, `❌ Use the format <code>YYYY-MM-DD</code> or just type <code>today</code>`, { reply_markup: cancelKeyboard() })
      return
    }
    const pending = { ...session.pending, date }
    setSession(chatId, { state: STATE.AWAITING_CONFIRM, pending })
    await send(chatId, `✅ Date updated!\n\n` + formatTransactionPreview(pending), { reply_markup: confirmKeyboard() })
    return
  }

  if (session.state === STATE.EDITING_NOTE) {
    const note = text.toLowerCase() === 'skip' ? '' : text
    const pending = { ...session.pending, note }
    setSession(chatId, { state: STATE.AWAITING_CONFIRM, pending })
    await send(chatId, `✅ Note updated!\n\n` + formatTransactionPreview(pending), { reply_markup: confirmKeyboard() })
    return
  }

  // ── AI parse ───────────────────────────────────────────────────────────────
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  const processingMsg = await send(chatId, `⏳ <b>Parsing your transaction...</b>`)

  const parsed = await parseTextWithAI(text, msg.from.id.toString())

  if (parsed?.error === 'rate_limit') {
    await edit(chatId, processingMsg.message_id,
      `⛔ <b>Daily limit reached</b>\n\n${parsed.message}`
    )
    return
  }

  // ── Bulk array ─────────────────────────────────────────────────────────────
  if (Array.isArray(parsed) && parsed.length > 0) {
    if (!getPreview(chatId)) {
      let savedCount = 0
      let failedCount = 0
      for (const txn of parsed) {
        try {
          const { error } = await saveTransaction(user.user_id, txn)
          if (error) failedCount++
          else savedCount++
        } catch (e) {
          failedCount++
        }
      }
      await edit(chatId, processingMsg.message_id, formatBulkSummary(parsed, savedCount, failedCount))
      const hasExpenses = parsed.some(t => t.type === 'expense')
      if (hasExpenses) await triggerBudgetAlert(user.user_id)
    } else {
      setPendingBulk(chatId, parsed)
      await edit(chatId, processingMsg.message_id, formatBulkPreview(parsed), { reply_markup: confirmAllKeyboard() })
    }
    return
  }

  // ── Single result ──────────────────────────────────────────────────────────
  if (!parsed || !parsed.amount) {
    await edit(chatId, processingMsg.message_id,
      `🤔 <b>Couldn't understand that</b>\n\n` +
      `Try phrasing it like:\n` +
      `· <i>"spent 500 on lunch"</i>\n` +
      `· <i>"received 50000 salary"</i>\n` +
      `· <i>"paid 1200 for electricity"</i>\n\n` +
      `Or use /add for guided manual entry.`
    )
    return
  }

  if (!getPreview(chatId)) {
    const { error } = await saveTransaction(user.user_id, parsed)
    if (error) {
      await edit(chatId, processingMsg.message_id, `❌ Failed to save. Please try again.`)
      return
    }
    await edit(chatId, processingMsg.message_id, formatSavedTransaction(parsed))
    if (parsed.type === 'expense') {
      const alert = await checkBudgetAlerts(user.user_id, parsed.category)
      if (alert) await send(chatId, formatBudgetAlert(alert))
      await triggerBudgetAlert(user.user_id)
    }
  } else {
    setSession(chatId, {
      state: STATE.AWAITING_CONFIRM,
      pending: parsed,
      editMessageId: processingMsg.message_id
    })
    await edit(chatId, processingMsg.message_id,
      formatTransactionPreview(parsed),
      { reply_markup: confirmKeyboard() }
    )
  }
})

// ─── Handle callback queries ──────────────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id
  const messageId = query.message.message_id
  const data = query.data
  const session = getSession(chatId)

  await answer(query.id)

  // ── Save all (bulk) ────────────────────────────────────────────────────────
  if (data === 'confirm_save_all') {
    const user = await requireUser(chatId, query.from.id)
    if (!user) return

    const bulk = getPendingBulk(chatId)
    if (!bulk || bulk.length === 0) {
      await edit(chatId, messageId, `⏱ Session expired. Please send the message again.`)
      return
    }

    let savedCount = 0
    let failedCount = 0
    for (const txn of bulk) {
      try {
        const { error } = await saveTransaction(user.user_id, txn)
        if (error) failedCount++
        else savedCount++
      } catch (e) {
        failedCount++
      }
    }

    clearPendingBulk(chatId)
    await edit(chatId, messageId, formatBulkSummary(bulk, savedCount, failedCount))

    const hasExpenses = bulk.some(t => t.type === 'expense')
    if (hasExpenses) await triggerBudgetAlert(user.user_id)
    return
  }

  // ── Save single ────────────────────────────────────────────────────────────
  if (data === 'confirm_save') {
    const user = await requireUser(chatId, query.from.id)
    if (!user) return

    const pending = session.pending
    if (!pending) {
      await send(chatId, `⏱ Session expired. Please try again.`)
      clearSession(chatId)
      return
    }

    const { error } = await saveTransaction(user.user_id, pending)
    if (error) {
      await edit(chatId, messageId, `❌ Couldn't save right now. Please try again.`)
      return
    }

    clearSession(chatId)
    await edit(chatId, messageId, formatSavedTransaction(pending))

    if (pending.type === 'expense') {
      const alert = await checkBudgetAlerts(user.user_id, pending.category)
      if (alert) await send(chatId, formatBudgetAlert(alert))
      await triggerBudgetAlert(user.user_id)
    }
    return
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  if (data === 'edit_transaction') {
    await edit(chatId, messageId, `✏️ <b>What would you like to change?</b>`, { reply_markup: editFieldKeyboard() })
    return
  }

  if (data === 'edit_amount') {
    setSession(chatId, { state: STATE.EDITING_AMOUNT })
    await edit(chatId, messageId, `✏️ <b>New amount</b>\n\nEnter the correct amount:\n<code>750</code>`, { reply_markup: cancelKeyboard() })
    return
  }

  if (data === 'edit_type') {
    setSession(chatId, { state: STATE.EDITING_TYPE })
    await edit(chatId, messageId, `✏️ <b>Transaction type</b>\n\nIs this money going out or coming in?`, { reply_markup: typeKeyboard() })
    return
  }

  if (data === 'edit_category') {
    const type = session.pending?.type || 'expense'
    setSession(chatId, { state: STATE.EDITING_CATEGORY })
    await edit(chatId, messageId, `✏️ <b>Pick a category</b>`, { reply_markup: categoryKeyboard(type) })
    return
  }

  if (data === 'edit_date') {
    setSession(chatId, { state: STATE.EDITING_DATE })
    await edit(chatId, messageId,
      `✏️ <b>New date</b>\n\nFormat: <code>YYYY-MM-DD</code>\nOr type <code>today</code>`,
      { reply_markup: cancelKeyboard() }
    )
    return
  }

  if (data === 'edit_note') {
    setSession(chatId, { state: STATE.EDITING_NOTE })
    await edit(chatId, messageId,
      `✏️ <b>New note</b>\n\nAdd a short description, or type <code>skip</code> to leave it blank.`,
      { reply_markup: cancelKeyboard() }
    )
    return
  }

  // ── Type selection ─────────────────────────────────────────────────────────
  if (data === 'type_expense' || data === 'type_income') {
    const type = data === 'type_expense' ? 'expense' : 'income'
    const pending = { ...session.pending, type }

    if (session.state === STATE.MANUAL_TYPE) {
      setSession(chatId, { state: STATE.MANUAL_CATEGORY, pending })
      await edit(chatId, messageId,
        `✍️ <b>Step 3 of 4 — Category</b>\n\nType selected: <b>${type === 'expense' ? '📉 Expense' : '📈 Income'}</b>\n\nNow pick a category:`,
        { reply_markup: categoryKeyboard(type) }
      )
    } else {
      setSession(chatId, { state: STATE.AWAITING_CONFIRM, pending })
      await edit(chatId, messageId,
        `✅ Type updated!\n\n` + formatTransactionPreview(pending),
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
      const today = new Date().toISOString().split('T')[0]
      setSession(chatId, { state: STATE.MANUAL_NOTE, pending: { ...pending, date: today } })
      await edit(chatId, messageId,
        `✍️ <b>Step 4 of 4 — Note</b>\n\nCategory: <b>${category}</b>\n\nAdd a short note or type <code>skip</code>:`,
        { reply_markup: cancelKeyboard() }
      )
    } else {
      setSession(chatId, { state: STATE.AWAITING_CONFIRM, pending })
      await edit(chatId, messageId,
        `✅ Category updated!\n\n` + formatTransactionPreview(pending),
        { reply_markup: confirmKeyboard() }
      )
    }
    return
  }

  // ── Back to preview ────────────────────────────────────────────────────────
  if (data === 'back_to_preview') {
    setSession(chatId, { state: STATE.AWAITING_CONFIRM })
    await edit(chatId, messageId, formatTransactionPreview(session.pending), { reply_markup: confirmKeyboard() })
    return
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────
  if (data === 'cancel') {
    clearSession(chatId)
    clearPendingBulk(chatId)
    await edit(chatId, messageId, `↩️ Cancelled. Send a transaction or use /add whenever you're ready.`)
    return
  }
})

// ─── Polling error handler ─────────────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message)
})

module.exports = bot
