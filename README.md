# 🤖 FinFlow Telegram Bot

Standalone Node.js Telegram bot for FinFlow — add transactions, scan receipts, get budget alerts, and receive app notifications via Telegram.

---

## ✨ Features

- 💬 **Natural language** — "spent 500 on lunch" → saved automatically
- 📷 **Receipt scanning** — Send a photo, AI extracts the transaction
- ✅ **Confirm/Edit/Cancel** — Inline buttons before saving
- ➕ **Manual entry** — Step-by-step guided entry with /add
- 💰 **Balance & summaries** — /balance, /monthly
- 📊 **Budget tracking** — /budgets with visual progress bars
- 🔔 **App notifications** — Get notified when you add via web app
- 🚨 **Budget alerts** — Warned at 80% and 100% of budget

---

## 📁 Project Structure

```
finflow-bot/
├── src/
│   ├── index.js      ← Entry point + Express server
│   ├── bot.js        ← All bot handlers
│   ├── ai.js         ← Sarvam AI + Gemini AI helpers
│   ├── db.js         ← Supabase database operations
│   ├── messages.js   ← Message formatters
│   ├── keyboards.js  ← Inline keyboard builders
│   ├── session.js    ← Conversation state manager
│   └── supabase.js   ← Supabase client
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 🚀 Setup & Deployment

### Step 1: Clone / Upload to GitHub
```bash
git init
git add .
git commit -m "Initial FinFlow bot"
git remote add origin https://github.com/yourusername/finflow-bot.git
git push -u origin main
```

### Step 2: Add environment variables
Copy `.env.example` to `.env` and fill in all values:
```bash
cp .env.example .env
```

| Variable | Where to get |
|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather on Telegram |
| `SUPABASE_URL` | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API |
| `SARVAM_API_KEY` | [console.sarvam.ai](https://console.sarvam.ai) |
| `GEMINI_API_KEY` | ai.google.dev |
| `WEBHOOK_SECRET` | Any random string (e.g. `abc123xyz`) |

### Step 3: Deploy to Render

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect your GitHub repo
3. Set these:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node src/index.js`
   - **Plan**: Free
4. Add all environment variables from `.env`
5. Click **Deploy**

### Step 4: Set up UptimeRobot (keep-alive — FREE)

Render free tier sleeps after 15 min inactivity. Fix this for free:

1. Go to [uptimerobot.com](https://uptimerobot.com) → Sign up free
2. Click **Add New Monitor**
3. Type: **HTTP(s)**
4. URL: your Render URL (e.g. `https://finflow-bot.onrender.com`)
5. Interval: **5 minutes**
6. Save → Your bot stays awake 24/7! ✅

---

## 🔔 App Notifications Setup

To receive Telegram notifications when adding transactions via the web app:

### Step 1: Add Supabase Webhook

1. Go to Supabase Dashboard → **Database → Webhooks**
2. Click **Create new webhook**
3. Settings:
   - **Name**: `telegram-notify`
   - **Table**: `transactions`
   - **Events**: ✅ INSERT
   - **URL**: `https://your-bot.onrender.com/notify/transaction`
   - **HTTP Headers**:
     - Key: `x-webhook-secret`
     - Value: your `WEBHOOK_SECRET` value

### Step 2: Add telegram_chat_id to settings table

Run this SQL in Supabase SQL Editor:
```sql
ALTER TABLE settings 
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
```

### Step 3: Update your Next.js Settings page

Add a "Connect Telegram" section that saves the user's Chat ID:
```typescript
// In your settings page, when user enters chat ID:
await supabase
  .from('settings')
  .update({ telegram_chat_id: chatId, telegram_id: telegramUserId })
  .eq('user_id', userId)
```

---

## 🤖 Bot Commands

| Command | Description |
|---|---|
| `/start` | Welcome message + Chat ID |
| `/menu` | Quick action menu with buttons |
| `/balance` | All-time income/expense/balance |
| `/monthly` | This month's summary |
| `/recent` | Last 5 transactions |
| `/budgets` | This month's budget progress |
| `/add` | Step-by-step manual entry |
| `/help` | Help message |

---

## 💬 Natural Language Examples

Just send a message (no command needed):
- `"spent 500 on lunch"`
- `"received 50000 salary"`
- `"paid 1200 electricity bill"`
- `"bought groceries 2500"`
- `"coffee 80"`
- `"freelance payment 15000"`

---

## 📷 Receipt Scanning

Just send any photo of a receipt and the bot will automatically scan and parse it using Google Gemini AI.

---

## 🛠 Local Development

```bash
npm install
cp .env.example .env
# Fill in .env values
npm run dev
```

---

## 📝 Notes

- Sessions are stored in memory — reset on server restart
- The bot uses polling mode (not webhook) — simpler, works on free tier
- Budget alerts trigger at 80% and 100% of monthly budget
- All amounts in Indian Rupees (₹)
