require('dotenv').config()
const express = require('express')
const bot = require('./bot')
const {
  getUserByChatId,
  getAllTelegramUsers,
  checkBudgetAlerts
} = require('./db')
const {
  formatAppNotification,
  formatBudgetAlert
} = require('./messages')

// ─── Startup: warn about missing required environment variables ───────────────
const required = [
  'TELEGRAM_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SARVAM_API_KEY',
  'GEMINI_API_KEY',
  'APP_URL',
  'WEBHOOK_SECRET'
]
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[STARTUP] Missing env var: ${key}`)
  }
}

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

// ─── Health check (keep-alive ping target) ────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    bot: 'FinFlow Bot',
    uptime: Math.round(process.uptime()) + 's',
    time: new Date().toISOString()
  })
})

// ─── Notification endpoint ────────────────────────────────────────────────────
// Called by Supabase webhook when a transaction is added via the web app
// POST /notify/transaction
// Body: { user_id, amount, type, category, note, date, source }
app.post('/notify/transaction', async (req, res) => {
  try {
    // Validate secret key to prevent abuse
    const secret = req.headers['x-webhook-secret']
    if (secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { user_id, amount, type, category, note, date, source } = req.body

    if (!user_id) return res.status(400).json({ error: 'Missing user_id' })

    // Find user's telegram chat_id from settings
    const { createClient } = require('@supabase/supabase-js')
    const supabase = require('./supabase')

    const { data: settings } = await supabase
      .from('settings')
      .select('telegram_chat_id, name')
      .eq('user_id', user_id)
      .single()

    if (!settings?.telegram_chat_id) {
      return res.json({ ok: true, message: 'User has no Telegram connected' })
    }

    const chatId = settings.telegram_chat_id
    const transaction = { amount, type, category, note, date }

    // Send notification
    await bot.sendMessage(chatId,
      formatAppNotification(transaction),
      { parse_mode: 'HTML' }
    )

    // Check budget alert after app transaction too
    if (type === 'expense') {
      const alert = await checkBudgetAlerts(user_id, category)
      if (alert) {
        await bot.sendMessage(chatId,
          formatBudgetAlert(alert),
          { parse_mode: 'HTML' }
        )
      }
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Notification error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── Budget alert broadcast endpoint ─────────────────────────────────────────
// Can be called by a cron job to check all users' budgets daily
app.post('/notify/budget-check', async (req, res) => {
  try {
    const secret = req.headers['x-webhook-secret']
    if (secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const users = await getAllTelegramUsers()
    let notified = 0

    for (const user of users) {
      if (!user.telegram_chat_id) continue

      const supabase = require('./supabase')
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

      const { data: budgets } = await supabase
        .from('budgets')
        .select('category')
        .eq('user_id', user.user_id)
        .eq('month', month)

      for (const budget of (budgets || [])) {
        const alert = await checkBudgetAlerts(user.user_id, budget.category)
        if (alert) {
          await bot.sendMessage(user.telegram_chat_id,
            formatBudgetAlert(alert),
            { parse_mode: 'HTML' }
          )
          notified++
        }
      }
    }

    res.json({ ok: true, notified })
  } catch (err) {
    console.error('Budget check error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 FinFlow Bot server running on port ${PORT}`)
  console.log(`🤖 Bot is polling for messages...`)
  console.log(`💡 Keep-alive URL: http://localhost:${PORT}/`)
})
