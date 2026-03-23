// ─── Confirm/Edit/Cancel buttons after parsing ───────────────────────────────
function confirmKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '✅ Save', callback_data: 'confirm_save' },
        { text: '✏️ Edit', callback_data: 'edit_transaction' },
        { text: '❌ Cancel', callback_data: 'cancel' }
      ]
    ]
  }
}

// ─── Edit field selection keyboard ───────────────────────────────────────────
function editFieldKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '💰 Amount', callback_data: 'edit_amount' },
        { text: '📂 Type', callback_data: 'edit_type' }
      ],
      [
        { text: '🏷 Category', callback_data: 'edit_category' },
        { text: '📅 Date', callback_data: 'edit_date' }
      ],
      [
        { text: '📝 Note', callback_data: 'edit_note' },
        { text: '🔙 Back', callback_data: 'back_to_preview' }
      ]
    ]
  }
}

// ─── Type selection keyboard ──────────────────────────────────────────────────
function typeKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🔴 Expense', callback_data: 'type_expense' },
        { text: '🟢 Income', callback_data: 'type_income' }
      ]
    ]
  }
}

// ─── Category keyboard ────────────────────────────────────────────────────────
function categoryKeyboard(type = 'expense') {
  const expenseCategories = [
    ['🍽 Food & Dining', 'cat_Food & Dining'],
    ['🚗 Transport', 'cat_Transport'],
    ['🛍 Shopping', 'cat_Shopping'],
    ['⚡ Bills & Utilities', 'cat_Bills & Utilities'],
    ['🎬 Entertainment', 'cat_Entertainment'],
    ['🏥 Health', 'cat_Health'],
    ['📚 Education', 'cat_Education'],
    ['🏠 Rent', 'cat_Rent'],
    ['🛒 Groceries', 'cat_Groceries'],
    ['💄 Personal Care', 'cat_Personal Care'],
    ['📦 Other', 'cat_Other']
  ]

  const incomeCategories = [
    ['💼 Salary', 'cat_Salary'],
    ['💻 Freelance', 'cat_Freelance'],
    ['🏢 Business', 'cat_Business'],
    ['📈 Investment', 'cat_Investment'],
    ['🎁 Gift', 'cat_Gift'],
    ['📦 Other', 'cat_Other']
  ]

  const cats = type === 'income' ? incomeCategories : expenseCategories

  // Group into rows of 2
  const rows = []
  for (let i = 0; i < cats.length; i += 2) {
    const row = [{ text: cats[i][0], callback_data: cats[i][1] }]
    if (cats[i + 1]) row.push({ text: cats[i + 1][0], callback_data: cats[i + 1][1] })
    rows.push(row)
  }

  return { inline_keyboard: rows }
}

// ─── Main menu keyboard ───────────────────────────────────────────────────────
function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '💰 Balance', callback_data: 'menu_balance' },
        { text: '📅 This Month', callback_data: 'menu_monthly' }
      ],
      [
        { text: '📋 Recent', callback_data: 'menu_recent' },
        { text: '📊 Budgets', callback_data: 'menu_budgets' }
      ],
      [
        { text: '➕ Add Manually', callback_data: 'menu_manual' }
      ]
    ]
  }
}

// ─── Cancel only keyboard ─────────────────────────────────────────────────────
function cancelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '❌ Cancel', callback_data: 'cancel' }]
    ]
  }
}

// ─── Back to preview keyboard ─────────────────────────────────────────────────
function backToPreviewKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔙 Back to Preview', callback_data: 'back_to_preview' }]
    ]
  }
}

// ─── Confirm all / Cancel keyboard for bulk preview ──────────────────────────
function confirmAllKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '✅ Save All', callback_data: 'confirm_save_all' },
        { text: '❌ Cancel', callback_data: 'cancel' }
      ]
    ]
  }
}

module.exports = {
  confirmKeyboard,
  confirmAllKeyboard,
  editFieldKeyboard,
  typeKeyboard,
  categoryKeyboard,
  mainMenuKeyboard,
  cancelKeyboard,
  backToPreviewKeyboard
}
