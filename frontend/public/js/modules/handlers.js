import {
  metabolicLoop,
  getMetabolicAdvice,
  resetBmrTracking,
  resetHrToBaseline,
  getMetabolicPhaseInfo,
  HR_MANUAL_TIMESTAMP_KEY,
  HR_DECAY_BASELINE_KEY,
  HR_ALERT_START_KEY,
  HR_BASELINE
} from './engine.js'
import {
  STORAGE_KEY,
  MEALS_LOG_KEY,
  normalizeFineMeal,
  load,
  save,
  loadMealsLog,
  saveMealsLog,
  loadFoodLibrary,
  addFoodToLibrary,
  deleteFoodFromLibrary,
  findFoodInLibrary,
  loadNightTests,
  saveNightTests
} from './storage.js'
import {
  render,
  renderFineLog,
  updateStepDisplay,
  formatTimeHHmm,
  updateMetabolicChart,
  updateAdviceBox
} from './ui_render.js'
import { Calc } from '../calc.js'

const jsonModal = document.getElementById('jsonModal')
const jsonList = document.getElementById('jsonList')
const jsonFileInput = document.getElementById('jsonFileInput')
const btnExportTxt = document.getElementById('btnExportTxt')
const btnCloseJson = document.getElementById('btnCloseJson')
const libraryModal = document.getElementById('libraryModal')
const libraryListNode = document.getElementById('libraryList')
const nightTestResultNode = document.getElementById('nightTestResult')
const nightTestHistoryNode = document.getElementById('nightTestHistory')
const hrDisplayNode = document.getElementById('tvHR')
const HR_CRITICAL_THRESHOLD = 120
const HR_CRITICAL_DELAY_MS = 15 * 60 * 1000
const btnNight = document.getElementById('btnNightTest')
const btnNightSubmit = document.getElementById('btnNightSubmit')
const btnJson = document.getElementById('btnJson')
const btnCloseLibrary = document.getElementById('btnCloseLibrary')
const btnLibrary = document.getElementById('btnLibrary')
const btnReload = document.getElementById('btnReload')
const btnKcal = document.getElementById('btnEditKcal')
const btnHr = document.getElementById('btnEditHR')
const btnEditFood = document.getElementById('btnEditFood')
const btnProfile = document.getElementById('btnProfile')
const btnSteps = document.getElementById('btnSteps')
const form = document.getElementById('foodForm')
const signupTrigger = document.getElementById('signupTrigger')
const emailSignupForm = document.getElementById('emailSignupForm')
const emailAuthForm = document.getElementById('emailAuthForm')
const btnGoogleLogin = document.getElementById('btnGoogleLogin')
const btnSignOut = document.getElementById('btnSignOut')

let metabolicTimer = null
let isSynced = false
let editingTimestamp = null
let lastSelectedLibraryEntry = null
const LAST_ACCESS_DATE_KEY = 'last_access_date'
const ITEM_ARCHIVE_PREFIX = 'biocore_items_archive_'
const DAILY_BALANCE_KEY = 'biocore_daily_balance'
const MIDNIGHT_CHECK_INTERVAL_MS = 60 * 60 * 1000
const NIGHT_TEST_HISTORY_LIMIT = 12
const MACRO_FIELDS = ['fastCarbs', 'slowCarbs', 'proteins', 'fats']

function $(selector) {
  return document.querySelector(selector)
}

function sameLocalDate(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
}

export function renderJsonList(dateObj) {
  const meals = loadMealsLog()
  const lines = meals
    .filter((m) => m.timestamp && sameLocalDate(new Date(m.timestamp), dateObj))
    .map((m) => `${formatTimeHHmm(m.timestamp)} ${m.name} ${m.grams} g`)
  if (jsonList) jsonList.textContent = lines.join('\n') || '(no meals)'
}

function getFoodFormButton() {
  return document.querySelector('#foodForm button[type="submit"]')
}

function setFormButtonText(text) {
  const btn = getFoodFormButton()
  if (btn) btn.textContent = text
}

export function toggleSignupFormVisibility(forceShow) {
  if (!emailSignupForm) return false
  const currentlyHidden = emailSignupForm.classList.contains('hidden')
  const show = typeof forceShow === 'boolean' ? forceShow : currentlyHidden
  emailSignupForm.classList.toggle('hidden', !show)
  if (signupTrigger) signupTrigger.setAttribute('aria-expanded', show ? 'true' : 'false')
  return show
}

function calcCalories(grams = 0, calPer100 = 0) {
  const g = Number(grams) || 0
  const c = Number(calPer100) || 0
  return Math.round((g * c) / 100)
}

function toTimestamp(value) {
  const ts = Number(value)
  return Number.isFinite(ts) ? ts : null
}

function filterEntriesByTimestamp(list, timestamp) {
  const ts = toTimestamp(timestamp)
  if (ts === null) return list
  return list.filter((entry) => Number(entry.timestamp) !== ts)
}

function removeStoredEntriesByTimestamp(timestamp) {
  const ts = toTimestamp(timestamp)
  if (ts === null) return false
  const items = load()
  const filteredItems = filterEntriesByTimestamp(items, ts)
  const meals = loadMealsLog()
  const filteredMeals = filterEntriesByTimestamp(meals, ts)
  if (filteredItems.length === items.length && filteredMeals.length === meals.length) {
    return false
  }
  save(filteredItems)
  saveMealsLog(filteredMeals)
  return true
}

function resetEditingState(formElement) {
  editingTimestamp = null
  lastSelectedLibraryEntry = null
  updateCaloriesPreview(0, 0)
  setFormButtonText('Добави')
  if (formElement) formElement.reset()
}

function formatDecimal(value, decimals = 1) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ''
  const formatted = numeric.toFixed(decimals)
  return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted
}

function formatMacroInput(value) {
  return formatDecimal(value, 1)
}

function parseFloatOrZero(rawValue, fallback = 0) {
  const parsed = parseFloat(rawValue)
  return Number.isFinite(parsed) ? parsed : fallback
}

function resolveGramInput(rawValue, { defaultToPer100 = true } = {}) {
  if (rawValue === '' || rawValue === null || rawValue === undefined || (typeof rawValue === 'string' && rawValue.trim() === '')) {
    return defaultToPer100 ? 100 : 0
  }
  const parsed = parseFloat(rawValue)
  if (!Number.isFinite(parsed)) {
    return defaultToPer100 ? 100 : 0
  }
  return parsed
}

function buildScaledMacros(entry, grams) {
  if (!entry) return {}
  const multiplier = grams / 100
  return MACRO_FIELDS.reduce((acc, key) => {
    const base = Number(entry[key]) || 0
    acc[key] = base * multiplier
    return acc
  }, {})
}

function calculateMacrosCalories(macros = {}) {
  const totalCarbs = (Number(macros.fastCarbs) || 0) + (Number(macros.slowCarbs) || 0)
  const proteins = Number(macros.proteins) || 0
  const fats = Number(macros.fats) || 0
  return {
    carbs: totalCarbs,
    protein: proteins,
    fat: fats,
    calories: totalCarbs * 4 + proteins * 4 + fats * 9
  }
}

function derivePer100EntryFromMeal(meal, macros = {}) {
  const gramValue = Number(meal?.grams) || 100
  const normalizedGrams = gramValue > 0 ? gramValue : 100
  const factor = 100 / normalizedGrams
  const per100 = MACRO_FIELDS.reduce((acc, key) => {
    const value = Number(macros[key]) || 0
    acc[key] = value * factor
    return acc
  }, {})
  const { calories } = calculateMacrosCalories(macros)
  per100.calPer100 = calories * factor
  return per100
}

const caloriesPreviewNode = document.getElementById('caloriesPreview')
function updateCaloriesPreview(grams, calPer100) {
  if (!caloriesPreviewNode) return
  const gramsValue = parseFloatOrZero(grams, 0)
  const baseCal = parseFloatOrZero(calPer100, 0)
  const total = (baseCal * gramsValue) / 100
  const display = formatDecimal(total, 1) || '0'
  caloriesPreviewNode.textContent = `Примерно ${display} kcal`
}

function fillFoodFields(values = {}, options = {}) {
  if (!values) return
  const {
    rememberLibraryEntry = false,
    libraryEntry = null,
    preserveGrams = false,
    preserveCalories = false
  } = options
  if (!preserveGrams && values.grams !== undefined) {
    const gramsInput = document.getElementById('grams')
    if (gramsInput) {
      const formatted = formatDecimal(values.grams, 1)
      gramsInput.value = formatted || ''
    }
  }
  if (!preserveCalories && values.calPer100 !== undefined) {
    const calInput = document.getElementById('calPer100')
    if (calInput) {
      const formatted = formatDecimal(values.calPer100, 1)
      calInput.value = formatted || ''
    }
  }
  MACRO_FIELDS.forEach((field) => {
    if (values[field] === undefined) return
    const input = document.getElementById(field)
    if (!input) return
    input.value = formatMacroInput(values[field])
  })
  if (rememberLibraryEntry) {
    lastSelectedLibraryEntry = libraryEntry || values || null
  }
}

function handleMealSelect(meal, idx) {
  if (!meal) return
  editingTimestamp = toTimestamp(meal.timestamp)
  const mealsLog = loadMealsLog()
  const logEntry = mealsLog.find((entry) => entry.timestamp === editingTimestamp)
  const formElement = document.getElementById('foodForm')
  const fields = {
    foodName: meal.name,
    grams: meal.grams,
    calPer100: meal.calPer100,
    fastCarbs: logEntry?.fastCarbs,
    slowCarbs: logEntry?.slowCarbs,
    proteins: logEntry?.proteins,
    fats: logEntry?.fats
  }
  Object.entries(fields).forEach(([key, value]) => {
    const input = document.getElementById(key)
    if (input) input.value = value ?? ''
  })
  const libraryMatch = findFoodInLibrary(meal.name)
  lastSelectedLibraryEntry = libraryMatch || null
  setFormButtonText('Обнови Запис')
  if (formElement) {
    formElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    document.getElementById('foodName')?.focus()
  }
}

export function rerenderMeals() {
  render(handleMealSelect)
}

function openJsonModal() {
  if (!jsonModal) return
  jsonModal.style.display = 'block'
  renderJsonList(new Date())
}

function closeJsonModal() {
  if (!jsonModal) return
  jsonModal.style.display = 'none'
}

function handleExportTxt() {
  const targetDate = document.getElementById('exportDate')?.value
  const mealsLog = loadMealsLog()
  const dateToMatch = targetDate || new Date().toISOString().split('T')[0]
  const filtered = mealsLog.filter(
    (m) => m.timestamp && new Date(m.timestamp).toISOString().split('T')[0] === dateToMatch
  )
  const output = filtered
    .map((m) => {
      const time = new Date(m.timestamp).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
      return `${time} ${m.name} ${m.grams} g`
    })
    .join('\n')
  const blob = new Blob([output], { type: 'text/plain' })
  const anchor = document.createElement('a')
  anchor.download = `meals_${dateToMatch}.txt`
  anchor.href = window.URL.createObjectURL(blob)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(anchor.href)
}

function handleJsonImport(ev) {
  const file = ev.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      const importedMeals = []
      const importedItems = []
      const mealsLog = loadMealsLog()
      arr.forEach((item) => {
        const normalized = normalizeFineMeal(item)
        const hasMacros = normalized.fastCarbs || normalized.slowCarbs || normalized.proteins || normalized.fats
        if (!hasMacros) return
        addFoodToLibrary({
          name: normalized.name,
          fastCarbs: normalized.fastCarbs,
          slowCarbs: normalized.slowCarbs,
          proteins: normalized.proteins,
          fats: normalized.fats,
          calPer100: normalized.calPer100
        })
        importedMeals.push(normalized)
        importedItems.push({
          name: normalized.name,
          grams: normalized.grams,
          calPer100: normalized.calPer100,
          timestamp: normalized.timestamp
        })
      })
      if (importedMeals.length) {
        mealsLog.push(...importedMeals)
        saveMealsLog(mealsLog)
        const tableItems = load()
        tableItems.push(...importedItems)
        save(tableItems)
        renderFoodLibraryOptions()
        rerenderMeals()
        renderFineLog()
        renderJsonList(new Date())
      }
    } catch (err) {
      console.error('Import failed', err)
    } finally {
      if (jsonFileInput) jsonFileInput.value = ''
    }
  }
  reader.readAsText(file)
}

function escapeHtml(value) {
  return (value || '').toString().replace(/[&<>"']/g, (ch) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return map[ch] || ch
  })
}

function handleFoodNameInput(ev) {
  const value = ev.target?.value || ''
  const match = findFoodInLibrary(value)
  if (match) {
    const gramsValue = resolveGramInput($('#grams')?.value, { defaultToPer100: true })
    const scaledMacros = buildScaledMacros(match, gramsValue)
    fillFoodFields({
      ...scaledMacros,
      grams: gramsValue,
      calPer100: match.calPer100
    }, {
      rememberLibraryEntry: true,
      libraryEntry: match
    })
    updateCaloriesPreview(gramsValue, match.calPer100)
  } else {
    lastSelectedLibraryEntry = null
    updateCaloriesPreview(0, 0)
  }
}

function handleGramsInputChange() {
  const gramsInput = document.getElementById('grams')
  if (!gramsInput || !lastSelectedLibraryEntry) return
  const gramsValue = resolveGramInput(gramsInput.value, { defaultToPer100: false })
  const scaledMacros = buildScaledMacros(lastSelectedLibraryEntry, gramsValue)
  fillFoodFields({
    ...scaledMacros
  }, {
    rememberLibraryEntry: true,
    libraryEntry: lastSelectedLibraryEntry,
    preserveGrams: true,
    preserveCalories: true
  })
  updateCaloriesPreview(gramsValue, lastSelectedLibraryEntry.calPer100)
}

function renderLibraryList() {
  if (!libraryListNode) return
  const library = loadFoodLibrary()
  if (!library.length) {
    libraryListNode.innerHTML = '<div class="library-empty">Няма още записи в библиотеката.</div>'
    return
  }
  libraryListNode.innerHTML = library.map((entry) => {
    const safeName = escapeHtml(entry.name)
    const encodedName = encodeURIComponent(entry.name)
    return `
      <div class="library-entry">
        <div class="library-entry__meta">
          <strong>${safeName}</strong>
          <span>${entry.fastCarbs}g fast | ${entry.slowCarbs}g slow | ${entry.proteins}g protein | ${entry.fats}g fat | ${entry.calPer100} kcal/100g</span>
        </div>
        <button class="small btn-library-delete" data-delete-entry="${encodedName}">X</button>
      </div>`
  }).join('')
}

function openLibraryModal() {
  renderLibraryList()
  if (!libraryModal) return
  libraryModal.classList.remove('hidden')
}

function closeLibraryModal() {
  if (!libraryModal) return
  libraryModal.classList.add('hidden')
}

function handleLibraryListClick(ev) {
  const btn = ev.target.closest('button[data-delete-entry]')
  if (!btn) return
  const name = decodeURIComponent(btn.dataset.deleteEntry || '')
  deleteFoodFromLibrary(name)
  renderFoodLibraryOptions()
  renderLibraryList()
}

export function renderFoodLibraryOptions() {
  const library = loadFoodLibrary()
  const dataList = document.getElementById('foodLibraryList')
  if (!dataList) return
  dataList.innerHTML = ''
  library.forEach((entry) => {
    const option = document.createElement('option')
    option.value = entry.name
    dataList.appendChild(option)
  })
}

function formatMacroLine(label, macros = {}) {
  const carbs = (macros.carbs || 0).toFixed(1)
  const fats = (macros.fats || 0).toFixed(1)
  const protein = (macros.protein || 0).toFixed(1)
  return `${label}: Carbs: ${carbs}g | Fats: ${fats}g | Protein: ${protein}g`
}

function refreshProfilePanel(loopData) {
  const panel = getProfilePanel()
  const weight = Number(localStorage.getItem('biocore_weight') || 70)
  const height = Number(localStorage.getItem('biocore_height') || 170)
  const age = Number(localStorage.getItem('biocore_age') || 30)
  const gender = localStorage.getItem('biocore_gender') || 'male'
  const targetWeight = Number(localStorage.getItem('biocore_target_weight') || 0)
  const fatFromCarbs = Number(localStorage.getItem('biocore_fat_from_carbs') || 0)
  const burnSummary = loopData?.burnSummary || {}
  const totalProteinIn = loadMealsLog().reduce((sum, meal) => sum + (Number(meal.proteins) || 0), 0)
  const proteinBurned = (burnSummary.total?.protein) || 0
  const proteinSurplus = loopData?.mode === 'Muscle Build'
    ? Math.max(0, totalProteinIn - proteinBurned)
    : null
  const lines = []
  lines.push(`<div>Weight: <strong>${weight} kg</strong> <button data-edit="weight">Edit</button></div>`)
  lines.push(`<div>Height: <strong>${height} cm</strong> <button data-edit="height">Edit</button></div>`)
  lines.push(`<div>Age: <strong>${age}</strong> <button data-edit="age">Edit</button></div>`)
  lines.push(`<div>Gender: <strong>${gender}</strong> <button data-edit="gender">Edit</button></div>`)
  lines.push(`<div>Target Weight: <strong>${targetWeight ? `${targetWeight} kg` : '-'}</strong> <button data-edit="targetWeight">Edit</button></div>`)
  lines.push('<hr/>')
  lines.push(`<div>BMR: <strong>${Math.round(loopData?.bmr || 0)} kcal/day</strong></div>`)
  lines.push(`<div>Stored fat from carbs: <strong>${fatFromCarbs.toFixed(1)} g</strong></div>`)
  lines.push('<div style="margin-top:8px; font-weight:700">Daily Burn Summary</div>')
  lines.push('<div class="profile-burn-line">' + formatMacroLine('Active', burnSummary.active) + '</div>')
  lines.push('<div class="profile-burn-line">' + formatMacroLine('Resting', burnSummary.resting) + '</div>')
  if (proteinSurplus !== null) {
    lines.push(`<div>Protein Surplus: <strong>${proteinSurplus.toFixed(1)} g</strong></div>`)
  }
  panel.innerHTML = lines.join('') + '<button class="profile-close">Close</button>'
  panel.querySelectorAll('[data-edit]').forEach((btn) => {
    const field = btn.dataset.edit
    btn.addEventListener('click', () => editProfileField(field))
  })
  panel.querySelector('.profile-close')?.addEventListener('click', () => panel.remove())
}

function getProfilePanel() {
  let panel = document.getElementById('profilePanel')
  if (!panel) {
    panel = document.createElement('div')
    panel.id = 'profilePanel'
    panel.style.cssText = 'position:fixed;top:10%;left:50%;transform:translateX(-50%);background:#0d0f1a;color:#fff;padding:16px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,0.45);z-index:3000;width:320px;font-family:monospace;letter-spacing:0.5px;'
    document.body.appendChild(panel)
  }
  panel.style.display = 'block'
  return panel
}

function editProfileField(field) {
  const mapping = {
    weight: { key: 'biocore_weight', prompt: 'Enter weight (kg)', parser: Number },
    height: { key: 'biocore_height', prompt: 'Enter height (cm)', parser: Number },
    age: { key: 'biocore_age', prompt: 'Enter age', parser: Number },
    gender: { key: 'biocore_gender', prompt: 'Enter gender', parser: (value) => value?.trim() },
    targetWeight: { key: 'biocore_target_weight', prompt: 'Enter target weight (kg)', parser: Number }
  }
  const rule = mapping[field]
  if (!rule) return
  const current = localStorage.getItem(rule.key) || ''
  const promptValue = prompt(rule.prompt, current)
  if (promptValue === null) return
  const parsed = rule.parser(promptValue)
  if (rule.parser === Number && (isNaN(parsed) || parsed <= 0)) return alert('Invalid number')
  localStorage.setItem(rule.key, parsed)
  const loopData = refreshMetabolicStatus()
  renderFineLog()
  refreshProfilePanel(loopData)
}

function handleProfile() {
  const loopData = refreshMetabolicStatus()
  renderFineLog()
  refreshProfilePanel(loopData)
}

function handleSteps() {
  const current = Number(localStorage.getItem('biocore_steps') || 0)
  const input = prompt('Enter steps count', current)
  if (input === null) return
  const parsed = Number(input)
  if (!Number.isFinite(parsed) || parsed < 0) return alert('Invalid step count')
  localStorage.setItem('biocore_steps', parsed)
  updateStepDisplay(parsed)
}

function handleFormSubmit(ev) {
  ev.preventDefault()
  const name = $('#foodName')?.value.trim()
  const grams = parseFloatOrZero($('#grams')?.value)
  const calPer100 = parseFloatOrZero($('#calPer100')?.value)
  const fast = parseFloatOrZero($('#fastCarbs')?.value)
  const slow = parseFloatOrZero($('#slowCarbs')?.value)
  const prot = parseFloatOrZero($('#proteins')?.value)
  const fat = parseFloatOrZero($('#fats')?.value)
  const offsetMinutes = Number($('#foodTimeOffset')?.value) || 0
  if (!name || grams <= 0) return
  const isEditing = editingTimestamp !== null
  const nowStamp = Date.now()
  const offsetMs = Math.max(0, offsetMinutes) * 60000
  const timestamp = Math.max(0, nowStamp - offsetMs)
  let items = load()
  const entry = { name, grams, calPer100, timestamp }
  if (isEditing) {
    items = filterEntriesByTimestamp(items, editingTimestamp)
  }
  items.push(entry)
  save(items)
  let meals = loadMealsLog()
  const normalized = normalizeFineMeal({
    name,
    grams,
    calPer100,
    timestamp,
    fastCarbs: fast,
    slowCarbs: slow,
    proteins: prot,
    fats: fat
  })
  if (isEditing) {
    meals = filterEntriesByTimestamp(meals, editingTimestamp)
  }
  meals.push(normalized)
  saveMealsLog(meals)
  addFoodToLibrary({
    name,
    fastCarbs: fast,
    slowCarbs: slow,
    proteins: prot,
    fats: fat,
    calPer100
  })
  renderFoodLibraryOptions()
  resetEditingState(ev.target)
  rerenderMeals()
  renderFineLog()
}

function handleRowDelete(ev) {
  const btn = ev.target.closest('button[data-ts]')
  if (!btn) return
  const timestamp = toTimestamp(btn.dataset.ts)
  if (timestamp === null) return
  const removed = removeStoredEntriesByTimestamp(timestamp)
  if (!removed) return
  resetEditingState(document.getElementById('foodForm'))
  rerenderMeals()
  const loopData = metabolicLoop()
  refreshMetabolicStatus(undefined, loopData)
  renderFineLog()
}

function getCurrentDateString(date = new Date()) {
  return date.toISOString().split('T')[0]
}

function archiveItemsForDate(dateString) {
  if (!dateString) return
  const entries = load()
  if (!entries.length) return
  localStorage.setItem(`${ITEM_ARCHIVE_PREFIX}${dateString}`, JSON.stringify({ date: dateString, entries }))
}

export function resetStepsAtMidnight() {
  const today = getCurrentDateString()
  const lastAccess = localStorage.getItem(LAST_ACCESS_DATE_KEY)
  const isNewDay = lastAccess && lastAccess !== today
  if (isNewDay) {
    resetBmrTracking()
    resetHrToBaseline()
    updateHrPulseState(HR_BASELINE)
    archiveItemsForDate(lastAccess)
    save([])
    localStorage.setItem('biocore_steps', '0')
    localStorage.setItem('biocore_active_kcal', '0')
    localStorage.setItem('biocore_fat_burned_today', '0')
    localStorage.setItem(DAILY_BALANCE_KEY, '0')
    const tvBalance = document.getElementById('tvDailyBalance')
    if (tvBalance) tvBalance.textContent = '0 kcal'
    rerenderMeals()
    renderFineLog()
  }
  localStorage.setItem(LAST_ACCESS_DATE_KEY, today)
}

function handleEditKcal() {
  const current = Number(localStorage.getItem('biocore_active_kcal') || 0)
  const promptValue = prompt('Enter active kcal for today', current)
  if (promptValue === null) return
  const parsed = Number(promptValue)
  if (isNaN(parsed)) return alert('Invalid number')
  localStorage.setItem('biocore_active_kcal', parsed)
  refreshMetabolicStatus()
}

function handleEditHR() {
  const current = Number(localStorage.getItem('biocore_hr') || HR_BASELINE)
  const promptValue = prompt('Enter heart rate (bpm)', current)
  if (promptValue === null) return
  const parsed = Number(promptValue)
  if (!Number.isFinite(parsed) || parsed <= 0) return alert('Invalid heart rate')
  localStorage.setItem('biocore_hr', parsed)
  localStorage.setItem(HR_MANUAL_TIMESTAMP_KEY, String(Date.now()))
  localStorage.setItem(HR_DECAY_BASELINE_KEY, String(parsed))
  localStorage.removeItem(HR_ALERT_START_KEY)
  refreshMetabolicStatus()
  updateHrPulseState(parsed)
}

function handleEditFoodClick() {
  if (form) {
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const name = document.getElementById('foodName')
  if (name) name.focus()
}

function updateHrPulseState(hr) {
  if (!hrDisplayNode) return
  if (hr > HR_CRITICAL_THRESHOLD) {
    const now = Date.now()
    const startTime = Number(localStorage.getItem(HR_ALERT_START_KEY) || 0)
    if (!startTime) {
      localStorage.setItem(HR_ALERT_START_KEY, String(now))
      hrDisplayNode.classList.remove('hr-critical')
      return
    }
    if (now - startTime >= HR_CRITICAL_DELAY_MS) {
      hrDisplayNode.classList.add('hr-critical')
      return
    }
    hrDisplayNode.classList.remove('hr-critical')
    return
  }
  localStorage.removeItem(HR_ALERT_START_KEY)
  hrDisplayNode.classList.remove('hr-critical')
}

function refreshAdvice() {
  updateAdviceBox(getMetabolicAdvice())
}

export function resetStoredData() {
  const keysToClear = [
    STORAGE_KEY,
    MEALS_LOG_KEY,
    'biocore_glycogen',
    'biocore_fat_from_carbs',
    'biocore_active_kcal',
    'biocore_fat_burned_today',
    'biocore_hr',
    'biocore_weight',
    'biocore_height',
    'biocore_age',
    'biocore_gender',
    'biocore_target_weight',
    'biocore_mode',
    'biocore_food_library',
    'night_evening_weight',
    'night_morning_weight'
  ]
  keysToClear.forEach((key) => localStorage.removeItem(key))
  window.location.reload()
}

let nightTestHistory = []

function updateMetabolicDisplay(loopData) {
  const {
    result,
    glycogen,
    mode,
    bmr,
    activeKcalDay,
    status,
    burnSummary = {},
    totalProteinIn = 0,
    fatBurnToday = 0
  } = loopData
  const tv = document.getElementById('tvMetabolicStatus')
  if (tv) {
    const proteinGPerHour = (result.influxRateGPerMin.protein || 0) * 60
    let extra = ''
    tv.style.color = ''
    if (mode === 'Fat Burn' && proteinGPerHour < 10) {
      extra = `<div style="color:#ff4444;font-weight:700">Muscle Wasting Risk!</div>`
      tv.style.color = '#ff4444'
    }
    if (mode === 'Muscle Build' && result.influxRateGPerMin.carbs > 0 && result.influxRateGPerMin.protein > 0) {
      extra = `<div style="color:#7CFC00;font-weight:700">Anabolic Window ACTIVE</div>`
      tv.style.color = '#7CFC00'
    }
    const detailLines = []
    if (mode === 'Fat Burn') {
      detailLines.push(`Fat burn today: ${Number(fatBurnToday).toFixed(2)} g`)
    }
    if (mode === 'Muscle Build') {
      const proteinBurned = (burnSummary.total?.protein) || 0
      const remainingProtein = Math.max(0, totalProteinIn - proteinBurned)
      detailLines.push(`Remaining Protein: over ${remainingProtein.toFixed(1)} g`)
    }
    const detailHtml = detailLines.length ? `<br>${detailLines.join('<br>')}` : ''
    tv.innerHTML = `Mode: ${mode}<br>Glycogen: ${glycogen.toFixed(1)}g<br>Blood Influx: ${result.influxRateGPerMin.carbs.toFixed(2)} g/min<br>Status: ${status}<br>BMR: ${Math.round(bmr)} kcal${extra}${detailHtml}`
  }
  if (hrDisplayNode) hrDisplayNode.textContent = loopData.hr
  updateHrPulseState(loopData.hr)
  const tvTotalOut = document.getElementById('tvTotalOut')
  const accumulatedBmr = Calc.getAccumulatedBMR(bmr, new Date(loopData.timestamp))
  const totalOut = Math.round(accumulatedBmr + (activeKcalDay || 0))
  if (tvTotalOut) tvTotalOut.textContent = `${totalOut} kcal so far`
  const phaseInfo = getMetabolicPhaseInfo(loopData.timestamp)
  const tvMetabolicPhase = document.getElementById('tvMetabolicPhase')
  if (tvMetabolicPhase) {
    const pct = Math.round(phaseInfo.percent * 100)
    tvMetabolicPhase.textContent = `Phase: ${phaseInfo.name} (${pct}% BMR rate)`
  }
  const totalIn = Number(document.getElementById('total')?.textContent || 0)
  const tvDailyBalance = document.getElementById('tvDailyBalance')
  if (tvDailyBalance) {
    tvDailyBalance.textContent = `${totalIn - totalOut} kcal`
  }
  const tvActive = document.getElementById('tvActiveKcal')
  if (tvActive) tvActive.textContent = `${Math.round(activeKcalDay)} kcal`
  const tvTopMet = document.getElementById('tvTopMetabolic')
  if (tvTopMet) {
    tvTopMet.textContent = `Glycogen ${glycogen.toFixed(0)}g • Influx ${result.influxRateGPerMin.carbs.toFixed(2)} g/min`
  }
  const glycBar = document.getElementById('glycogenBar')
  if (glycBar) {
    const pct = Math.min(100, (glycogen / 500) * 100)
    glycBar.style.width = `${pct}%`
    glycBar.textContent = `${glycogen.toFixed(1)} g`
    if (mode === 'Fat Burn') {
      glycBar.classList.add('glycogen-fatburn')
      glycBar.classList.remove('glycogen-musclebuild')
    } else if (mode === 'Muscle Build') {
      glycBar.classList.add('glycogen-musclebuild')
      glycBar.classList.remove('glycogen-fatburn')
    } else {
      glycBar.classList.remove('glycogen-fatburn')
      glycBar.classList.remove('glycogen-musclebuild')
    }
  }
}

export function refreshMetabolicStatus(modeOverride, providedLoopData) {
  const loopData = providedLoopData || metabolicLoop(modeOverride)
  updateMetabolicDisplay(loopData)
  const influxRate = Number(loopData.result.influxRateGPerMin.carbs || 0)
  updateMetabolicChart(formatTimeHHmm(loopData.timestamp), loopData.glycogen, influxRate)
  refreshAdvice()
  return loopData
}

export function initMetabolicMode() {
  const metabolicSelect = document.getElementById('metabolicMode')
  if (!metabolicSelect) return
  const stored = localStorage.getItem('biocore_mode')
  if (stored) metabolicSelect.value = stored
  metabolicSelect.addEventListener('change', (ev) => {
    const value = ev.target.value
    localStorage.setItem('biocore_mode', value)
    refreshMetabolicStatus(value)
  })
}

export function startMetabolicTicker() {
  if (metabolicTimer) return
  metabolicTimer = setInterval(() => refreshMetabolicStatus(), 5000)
}

function handleNightToggle() {
  const panel = document.getElementById('nightTestPanel')
  if (!panel) return
  panel.classList.toggle('hidden')
}

function handleNightSubmit(ev) {
  ev.preventDefault()
  const eve = parseFloatOrZero(document.getElementById('nightEvening')?.value)
  const mor = parseFloatOrZero(document.getElementById('nightMorning')?.value)
  if (eve > 0) localStorage.setItem('night_evening_weight', eve)
  if (mor > 0) localStorage.setItem('night_morning_weight', mor)
  console.log('Night test saved', { evening: eve, morning: mor })
  const summary = calculateNightBurn(eve, mor)
  const entry = {
    timestamp: Date.now(),
    eveningWeight: eve,
    morningWeight: mor,
    ...summary
  }
  appendNightTestEntry(entry)
  renderNightTestResult(entry)
  renderNightTestHistory()
  const panel = document.getElementById('nightTestPanel')
  if (panel) panel.style.display = 'none'
}

function calculateNightBurn(evening, morning) {
  const eveningKg = Number.isFinite(Number(evening)) ? Number(evening) : 0
  const morningKg = Number.isFinite(Number(morning)) ? Number(morning) : 0
  const diff = eveningKg - morningKg
  const totalLossKg = diff > 0 ? diff : 0
  const totalLossGrams = totalLossKg * 1000
  const calories = totalLossKg * 7700
  return { totalLossKg, totalLossGrams, calories }
}

function appendNightTestEntry(entry) {
  nightTestHistory = [entry, ...nightTestHistory]
  if (nightTestHistory.length > NIGHT_TEST_HISTORY_LIMIT) {
    nightTestHistory.length = NIGHT_TEST_HISTORY_LIMIT
  }
  saveNightTests(nightTestHistory)
  return nightTestHistory
}

function renderNightTestResult(entry) {
  if (!nightTestResultNode) return
  if (!entry) {
    nightTestResultNode.textContent = 'Натисни "CALCULATE" за да видиш нощната загуба.'
    return
  }
  const grams = formatDecimal(entry.totalLossGrams, 1) || '0'
  const calories = formatDecimal(entry.calories, 0) || '0'
  nightTestResultNode.textContent = `Снощи сте изгорили ${grams} грама телесна маса (~${calories} kcal).`
}

function renderNightTestHistory() {
  if (!nightTestHistoryNode) return
  const history = nightTestHistory
  if (!history.length) {
    nightTestHistoryNode.innerHTML = '<li style="color:#777">Няма записани тестове.</li>'
    return
  }
  nightTestHistoryNode.innerHTML = history.map((entry) => {
    const timeLabel = formatTimeHHmm(entry.timestamp)
    const grams = formatDecimal(entry.totalLossGrams, 1) || '0'
    const calories = formatDecimal(entry.calories, 0) || '0'
    const evening = formatDecimal(entry.eveningWeight, 1) || '0'
    const morning = formatDecimal(entry.morningWeight, 1) || '0'
    return `<li style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.08)">${timeLabel} — ${evening}kg → ${morning}kg — ${grams} g (~${calories} kcal)</li>`
  }).join('')
}

export function updateNightTestPanel() {
  const stored = loadNightTests()
  nightTestHistory = stored
  if (nightTestHistory.length) {
    renderNightTestResult(nightTestHistory[0])
  } else {
    renderNightTestResult(null)
  }
  renderNightTestHistory()
}

function handleSync() {
  if (!isSynced) {
    console.log('Initial Sync...')
    isSynced = true
    if (btnReload) {
      btnReload.innerText = 'RELOAD'
      btnReload.classList.add('synced')
    }
  } else {
    console.log('Reloading data...')
    rerenderMeals()
    renderFineLog()
    refreshMetabolicStatus()
  }
}

export function attachHandlers(authCallbacks = {}) {
  const { handleGoogleLogin, handleEmailAuth, handleEmailSignup, handleSignOut } = authCallbacks
  if (btnSteps) btnSteps.onclick = () => handleSteps()
  if (btnProfile) btnProfile.onclick = () => handleProfile()
  if (btnJson) btnJson.addEventListener('click', openJsonModal)
  if (btnCloseJson) btnCloseJson.addEventListener('click', closeJsonModal)
  if (btnExportTxt) btnExportTxt.addEventListener('click', handleExportTxt)
  if (jsonFileInput) jsonFileInput.addEventListener('change', handleJsonImport)
  if (btnReload) btnReload.addEventListener('click', handleSync)
  if (btnEditFood) btnEditFood.addEventListener('click', handleEditFoodClick)
  if (btnNight) btnNight.addEventListener('click', handleNightToggle)
  if (btnNightSubmit) btnNightSubmit.addEventListener('click', handleNightSubmit)
  if (btnKcal) btnKcal.addEventListener('click', handleEditKcal)
  if (btnHr) btnHr.addEventListener('click', handleEditHR)
  if (btnLibrary) btnLibrary.addEventListener('click', openLibraryModal)
  if (btnCloseLibrary) btnCloseLibrary.addEventListener('click', closeLibraryModal)
  if (libraryListNode) libraryListNode.addEventListener('click', handleLibraryListClick)
  const foodNameInput = document.getElementById('foodName')
  if (foodNameInput) foodNameInput.addEventListener('input', handleFoodNameInput)
  const gramsInput = document.getElementById('grams')
  if (gramsInput) gramsInput.addEventListener('input', handleGramsInputChange)
  if (libraryModal) {
    libraryModal.addEventListener('click', (evt) => {
      if (evt.target === libraryModal) closeLibraryModal()
    })
  }
  if (signupTrigger) {
    signupTrigger.addEventListener('click', (ev) => {
      ev.preventDefault()
      toggleSignupFormVisibility()
    })
  }
  if (emailSignupForm && handleEmailSignup) emailSignupForm.addEventListener('submit', handleEmailSignup)
  if (form) {
    form.addEventListener('submit', handleFormSubmit)
  } else {
    console.warn('Food form not found when attaching submit handler')
  }
  if (btnGoogleLogin && handleGoogleLogin) btnGoogleLogin.addEventListener('click', handleGoogleLogin)
  if (emailAuthForm && handleEmailAuth) emailAuthForm.addEventListener('submit', handleEmailAuth)
  if (btnSignOut && handleSignOut) btnSignOut.addEventListener('click', handleSignOut)
}

Object.assign(window, {
  openJsonModal,
  closeJsonModal,
  handleExportTxt,
  handleNightToggle,
  handleNightSubmit,
  handleEditFoodClick,
  handleFormSubmit,
  handleSync,
  handleSteps,
  handleProfile,
  resetStoredData
})

