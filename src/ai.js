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
            content: `You are a financial transaction parser for an Indian finance app. Extract transaction details from text (English, Hindi, or Bengali) and return ONLY valid JSON.\n\nCategories available:\nExpense: Food & Dining, Transport, Shopping, Bills & Utilities, Entertainment, Health, Education, Rent, Groceries, Personal Care, Other\nIncome: Salary, Freelance, Business, Investment, Gift\n\nReturn this exact JSON format:\n{\n  "amount": <number only, no currency symbols>,\n  "type": "income" or "expense",\n  "category": "<exact category name from list above>",\n  "note": "<brief description in English>",\n  "date": "<YYYY-MM-DD format, use today if not mentioned>"\n}\n\nToday's date: ${today}\nReturn ONLY the JSON object, no explanation, no markdown.`
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
      return JSON.parse(jsonMatch[0])
    } catch(e) {
      let attempt = jsonMatch[0]
      const opens = (attempt.match(/\{/g) || []).length
      const closes = (attempt.match(/\}/g) || []).length
      attempt += '}'.repeat(Math.max(0, opens - closes))
      return JSON.parse(attempt)
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
              { text: `Analyze this receipt or bill image and extract transaction details. Return ONLY valid JSON in this exact format:\n{\n  "amount": <total amount as number, no currency symbols>,\n  "type": "expense",\n  "category": "<one of: Food & Dining, Transport, Shopping, Bills & Utilities, Entertainment, Health, Education, Groceries, Personal Care, Other>",\n  "note": "<merchant name or brief description, max 50 chars>",\n  "date": "<YYYY-MM-DD format, use today ${today} if not visible on receipt>"\n}\nReturn ONLY the JSON object, no explanation, no markdown backticks.` }
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

    return JSON.parse(jsonMatch[0])
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
