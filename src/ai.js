const fetch = require('node-fetch')

// ─── Rate limiter (in-memory) ────────────────────────────────────────────────
const rateLimits = new Map()

const LIMITS = {
  text: 30,
  photo: 10,
}

function getRateLimitKey(userId, type) {
  const today = new Date().toISOString().split('T')[0]
  return `${userId}:${type}:${today}`
}

function checkRateLimit(userId, type) {
  const key = getRateLimitKey(userId, type)
  const count = rateLimits.get(key) || 0
  const limit = LIMITS[type]
  if (count >= limit) {
    return { allowed: false, count, limit }
  }
  rateLimits.set(key, count + 1)
  return { allowed: true, count: count + 1, limit }
}

function getRateLimitStatus(userId, type) {
  const key = getRateLimitKey(userId, type)
  const count = rateLimits.get(key) || 0
  const limit = LIMITS[type]
  return { count, limit, remaining: limit - count }
}

setInterval(() => {
  const today = new Date().toISOString().split('T')[0]
  for (const key of rateLimits.keys()) {
    if (!key.includes(today)) rateLimits.delete(key)
  }
}, 60 * 60 * 1000)

// ─── Parse text using Sarvam AI ──────────────────────────────────────────────
async function parseTextWithAI(text, userId = 'default') {
  const rateCheck = checkRateLimit(userId, 'text')
  if (!rateCheck.allowed) {
    return {
      error: 'rate_limit',
      message: `Daily limit reached (${rateCheck.limit} text parses/day). Resets at midnight.`
    }
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': process.env.SARVAM_API_KEY
      },
      body: JSON.stringify({
        model: 'sarvam-m',
        messages: [
          {
            role: 'system',
            content: `You are a financial transaction parser for an Indian finance app. The user may write in ANY language (English, Hindi, Bengali, Tamil, Telugu, or any other). Always extract details and return output in ENGLISH only.\n\nExtract transaction details and return ONLY valid JSON. No explanation, no markdown, no extra text.\n\nCategories (use EXACTLY one):\nFood & Dining, Transport, Shopping, Bills & Utilities, Entertainment, Health, Education, Rent, Groceries, Personal Care, Salary, Freelance, Business, Investment, Gift, Other\n\nSmart category matching rules:\n- food, lunch, dinner, breakfast, restaurant, cafe, swiggy, zomato, dominos → Food & Dining\n- uber, ola, auto, rickshaw, petrol, diesel, bus, metro, train ticket → Transport\n- amazon, flipkart, shopping, clothes, shoes, mall → Shopping\n- electricity, water, internet, wifi, mobile bill, recharge, gas bill → Bills & Utilities\n- movie, netflix, spotify, game, concert → Entertainment\n- doctor, medicine, hospital, pharmacy, medical → Health\n- school, college, course, fees, books → Education\n- rent, house rent, apartment, pg → Rent\n- grocery, vegetables, fruits, kirana, supermarket → Groceries\n- salon, parlour, haircut, spa → Personal Care\n- salary, stipend, payment received → Salary\n- freelance, project payment, client → Freelance\n- business income, shop income → Business\n- mutual fund, stocks, fd, investment → Investment\n- gift, birthday, wedding gift → Gift\n\nRules:\n- amount: number only, no currency symbols\n- type: "income" or "expense" only\n- category: EXACTLY one from list above\n- date: YYYY-MM-DD format, use today if not mentioned\n- note: brief description in ENGLISH, capitalize first letter\n- If text is in Hindi/Bengali/any language, translate the note to English\n\nToday's date: ${today}\n\nReturn ONLY this JSON format:\n{\n  "amount": 500,\n  "type": "expense",\n  "category": "Food & Dining",\n  "date": "${today}",\n  "note": "Lunch at restaurant"\n}`
          },
          { role: 'user', content: text }
        ],
        max_tokens: 600,
        temperature: 0.1
      })
    })

    const data = await response.json()
    if (data.error) {
      console.error('Sarvam API error:', data.error)
      return null
    }

    let content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
    if (!content) return null

    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    try {
      const result = JSON.parse(jsonMatch[0])
      if (result.note) {
        result.note = result.note.charAt(0).toUpperCase() + result.note.slice(1)
      }
      return result
    } catch(e) {
      let attempt = jsonMatch[0]
      const opens = (attempt.match(/\{/g) || []).length
      const closes = (attempt.match(/\}/g) || []).length
      attempt += '}'.repeat(Math.max(0, opens - closes))
      const result = JSON.parse(attempt)
      if (result.note) {
        result.note = result.note.charAt(0).toUpperCase() + result.note.slice(1)
      }
      return result
    }
  } catch (err) {
    console.error('Text parse error:', err.message)
    return null
  }
}

// ─── Parse photo using Gemini ─────────────────────────────────────────────────
async function parsePhotoWithAI(base64Image, mimeType, userId = 'default') {
  if (!mimeType) mimeType = 'image/jpeg'
  const rateCheck = checkRateLimit(userId, 'photo')
  if (!rateCheck.allowed) {
    return {
      error: 'rate_limit',
      message: `Daily limit reached (${rateCheck.limit} photo scans/day). Resets at midnight.`
    }
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: base64Image } },
              { text: `You are a receipt and document scanner for an Indian finance app. The receipt may be in ANY language. Always extract details and return output in ENGLISH only. Currency is INR (Indian Rupees ₹).\n\nAnalyze this receipt/bill/document image carefully and extract transaction details.\n\nCategories (use EXACTLY one):\nFood & Dining, Transport, Shopping, Bills & Utilities, Entertainment, Health, Education, Rent, Groceries, Personal Care, Salary, Freelance, Business, Investment, Gift, Other\n\nSmart category matching rules:\n- restaurant, cafe, hotel food, swiggy, zomato → Food & Dining\n- petrol pump, fuel, cab, taxi, bus, metro → Transport\n- retail store, mall, amazon, flipkart, clothes → Shopping\n- electricity bill, water bill, internet, mobile recharge → Bills & Utilities\n- pharmacy, medical store, hospital, clinic → Health\n- grocery store, supermarket, kirana, vegetables → Groceries\n\nRules:\n- amount: total amount as number, no currency symbols\n- type: always "expense" for receipts\n- category: EXACTLY one from list above\n- date: YYYY-MM-DD format, use today if not visible\n- note: merchant name or brief description in ENGLISH, max 50 characters, capitalize first letter\n- confidence: 0.0 to 1.0 how confident you are\n\nToday's date: ${today}\n\nReturn ONLY this JSON format, no explanation, no markdown backticks:\n{\n  "amount": 1200,\n  "type": "expense",\n  "category": "Groceries",\n  "date": "${today}",\n  "note": "Big Bazaar grocery shopping",\n  "confidence": 0.95\n}` }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
        })
      }
    )

    const data = await response.json()
    if (data.error) {
      console.error('Gemini API error:', data.error)
      return null
    }

    const content = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text
    if (!content) return null

    const jsonMatch = content.trim().match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const result = JSON.parse(jsonMatch[0])
    if (result.note) {
      result.note = result.note.charAt(0).toUpperCase() + result.note.slice(1)
    }
    return result
  } catch (err) {
    console.error('Photo parse error:', err.message)
    return null
  }
}

// ─── Download Telegram file ───────────────────────────────────────────────────
async function downloadTelegramFile(fileId, botToken) {
  try {
    const fileInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
    const fileInfo = await fileInfoRes.json()
    if (!fileInfo.ok) return null

    const filePath = fileInfo.result.file_path
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`
    const fileRes = await fetch(fileUrl)
    const buffer = await fileRes.buffer()
    const base64 = buffer.toString('base64')

    const ext = filePath.split('.').pop().toLowerCase()
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' }
    const mimeType = mimeMap[ext] || 'image/jpeg'

    return { base64, mimeType }
  } catch (err) {
    console.error('File download error:', err.message)
    return null
  }
}

module.exports = { parseTextWithAI, parsePhotoWithAI, downloadTelegramFile, getRateLimitStatus }
