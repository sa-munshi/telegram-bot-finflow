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
      `Account not linked.\n\nGo to FinFlow app → Settings → Connect Telegram\nEnter your Chat ID: <code>${chatId}</code>`
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
      `Welcome back, <b>${user.name || msg.from.first_name || 'there'}</b>.\n\nYour account is connected. Use /help to see commands.`
    )
  } else {
    await send(chatId,
      `Account not linked.\n\nGo to FinFlow app → Settings → Connect Telegram\nEnter your Chat ID: <code>${chatId}</code>`
    )
  }
})

// ─── /help ────────────────────────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id
  await send(chatId,
    `<b>FinFlow Bot</b>\n\n` +
    `Add transactions:\n` +
    `· Type naturally — "spent 500 on lunch"\n` +
    `· Send a receipt photo\n` +
    `· Use /add for step-by-step\n\n` +
    `Commands:\n` +
    `/recent     — Last 5 transactions\n` +
    `/add        — Manual entry\n` +
    `/limits     — Daily usage\n` +
    `/disconnect — Unlink account\n` +
    `/help       — This message`
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
    await send(chatId, '[ERROR] Could not disconnect. Please try again.')
    return
  }

  await send(chatId, 'Account disconnected. Your data is safe in FinFlow.')
})

// ─── /recent ──────────────────────────────────────────────────────────────────
bot.onText(/\/recent/, async (msg) => {
  const chatId = msg.chat.id
  const user = await requireUser(chatId, msg.from.id)
  if (!user) return

  const transactions = await getRecentTransactions(user.user_id, 5)
  await send(chatId, formatRecentTransactions(transactions))
})

// ─── /limits — show usage ─────────────────────────────────────────────────────
bot.onText(/\/limits/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id.toString()
  const text = getRateLimitStatus(userId, 'text')
  const photo = getRateLimitStatus(userId, 'photo')

  await send(chatId,
    `<b>Daily Usage</b>\n<pre>───────────────────\n` +
    `Text   ${text.remaining} / ${text.limit} remaining\n` +
    `Photo  ${photo.remaining} / ${photo.limit} remaining</pre>\n` +
    `Resets at midnight`
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
    'Step 1/4: Enter the <b>amount</b>\n\nExample: <code>500</code>',
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
      `Amount: <b>₹${amount.toLocaleString('en-IN')}</b>\n\nStep 2/4: Select the <b>type</b>`,
      { reply_markup: typeKeyboard() }
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
      formatTransactionPreview(pending),
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

  // ── Confirm save ───────────────────────────────────────────────────────────
  if (data === 'confirm_save') {
    const user = await requireUser(chatId, query.from.id)
    if (!user) return

    const pending = session.pending
    if (!pending) {
      await send(chatId, 'Session expired. Please try again.')
      clearSession(chatId)
      return
    }

    const { data: saved, error } = await saveTransaction(user.user_id, pending)

    if (error) {
      await edit(chatId, messageId, '[ERROR] Failed to save. Please try again.')
      return
    }

    clearSession(chatId)
    await edit(chatId, messageId, formatSavedTransaction(pending))

    // Check budget alerts
    if (pending.type === 'expense') {
      const alert = await checkBudgetAlerts(user.user_id, pending.category)
      if (alert) await send(chatId, formatBudgetAlert(alert))
      await triggerBudgetAlert(user.user_id)
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
        `Type: <b>${type}</b>\n\nStep 3/4: Select <b>category</b>`,
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
      const today = new Date().toISOString().split('T')[0]
      setSession(chatId, {
        state: STATE.MANUAL_NOTE,
        pending: { ...pending, date: today }
      })
      await edit(chatId, messageId,
        `Category: <b>${category}</b>\n\nStep 4/4: Add a <b>note</b> (or type <code>skip</code>)`,
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
    await edit(chatId, messageId, 'Cancelled. Send a message or use /add.')
    return
  }
})

// ─── Error handler ────────────────────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message)
})

module.exports = bot
