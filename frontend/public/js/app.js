import { Calc } from './calc.js'
import {
  STORAGE_KEY,
  MEALS_LOG_KEY,
  normalizeFineMeal,
  load,
  save,
  loadMealsLog,
  saveMealsLog
} from './modules/storage.js'
import { metabolicLoop } from './modules/engine.js'
import {
  render,
  renderFineLog,
  updateStepDisplay,
  initMetabolicChart,
  startFineNutritionTicker,
  restoreChartHistory,
  saveChartHistory,
  updateTimes,
  updateMetabolicChart,
  formatTimeHHmm
} from './modules/ui_render.js'

console.log('DEBUG: Biocore app.js initializing')

const METABOLIC_INTERVAL_MS = 5000
const CHART_HISTORY_SAVE_INTERVAL_MS = 60000

const jsonModal = document.getElementById('jsonModal')
const jsonList = document.getElementById('jsonList')
const jsonFileInput = document.getElementById('jsonFileInput')
const btnExportTxt = document.getElementById('btnExportTxt')
const btnCloseJson = document.getElementById('btnCloseJson')

let metabolicTimer = null
let isSynced = false

function $(selector) {
  return document.querySelector(selector)
}

function renderJsonList(dateObj) {
  const meals = loadMealsLog()
  const lines = meals
    .filter((m) => m.timestamp && sameLocalDate(new Date(m.timestamp), dateObj))
    .map((m) => `${formatTimeHHmm(m.timestamp)} ${m.name} ${m.grams} g`)
  if (jsonList) jsonList.textContent = lines.join('\n') || '(no meals)'
}

function sameLocalDate(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
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
        render()
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

function handleProfile() {
  const weight = Number(localStorage.getItem('biocore_weight') || 70)
  const height = Number(localStorage.getItem('biocore_height') || 170)
  const age = Number(localStorage.getItem('biocore_age') || 30)
  const gender = localStorage.getItem('biocore_gender') || 'male'
  const bmr = Calc && typeof Calc.calculateBMR === 'function'
    ? Calc.calculateBMR(weight, height, age, gender)
    : 0
  const fatFromCarbs = Number(localStorage.getItem('biocore_fat_from_carbs') || 0)
  alert(`Weight: ${weight} kg\nHeight: ${height} cm\nBMR: ${Math.round(bmr)} kcal/day\nStored fat from carbs: ${fatFromCarbs.toFixed(1)} g`)
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
  const grams = Number($('#grams')?.value) || 0
  const calPer100 = Number($('#calPer100')?.value) || 0
  const fast = Number($('#fastCarbs')?.value) || 0
  const slow = Number($('#slowCarbs')?.value) || 0
  const prot = Number($('#proteins')?.value) || 0
  const fat = Number($('#fats')?.value) || 0
  if (!name || grams <= 0) return
  const timestamp = Date.now()
  const items = load()
  items.push({ name, grams, calPer100, timestamp })
  save(items)
  const meals = loadMealsLog()
  meals.push(
    normalizeFineMeal({
      name,
      grams,
      calPer100,
      timestamp,
      fastCarbs: fast,
      slowCarbs: slow,
      proteins: prot,
      fats: fat
    })
  )
  saveMealsLog(meals)
  render()
  renderFineLog()
  ev.target.reset()
}

function handleRowDelete(ev) {
  const btn = ev.target.closest('button[data-idx]')
  if (!btn) return
  const idx = Number(btn.dataset.idx)
  if (Number.isNaN(idx)) return
  const items = load()
  items.splice(idx, 1)
  save(items)
  render()
  renderFineLog()
}

function promptAndStoreNumber(storageKey, label) {
  const current = localStorage.getItem(storageKey) || ''
  const promptValue = prompt(`Enter ${label}`, current)
  if (promptValue === null) return
  const parsed = Number(promptValue)
  if (isNaN(parsed)) return alert('Invalid number')
  localStorage.setItem(storageKey, parsed)
  handleSync()
}

function handleEditFoodClick() {
  const form = document.getElementById('foodForm')
  const name = document.getElementById('foodName')
  if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (name) name.focus()
}

function resetStoredData() {
  const keysToClear = [
    STORAGE_KEY,
    MEALS_LOG_KEY,
    'biocore_glycogen',
    'biocore_fat_from_carbs',
    'biocore_active_kcal',
    'biocore_hr',
    'biocore_weight',
    'biocore_height',
    'biocore_age',
    'biocore_gender',
    'biocore_mode',
    'night_evening_weight',
    'night_morning_weight'
  ]
  keysToClear.forEach((key) => localStorage.removeItem(key))
  window.location.reload()
}

function attachHandlers() {
  const btnSteps = document.getElementById('btnSteps')
  if (btnSteps) btnSteps.onclick = () => handleSteps()
  const btnProfile = document.getElementById('btnProfile')
  if (btnProfile) btnProfile.onclick = () => handleProfile()
  const btnJson = document.getElementById('btnJson')
  if (btnJson) btnJson.addEventListener('click', openJsonModal)
  if (btnCloseJson) btnCloseJson.addEventListener('click', closeJsonModal)
  if (btnExportTxt) btnExportTxt.addEventListener('click', handleExportTxt)
  if (jsonFileInput) jsonFileInput.addEventListener('change', handleJsonImport)
  const resetBtn = document.getElementById('btnResetData')
  if (resetBtn) resetBtn.addEventListener('click', resetStoredData)
  const form = document.getElementById('foodForm')
  if (form) {
    form.addEventListener('submit', handleFormSubmit)
  } else {
    console.warn('Food form not found when attaching submit handler')
  }
  document.addEventListener('click', handleRowDelete)
  const btnReload = document.getElementById('btnReload')
  if (btnReload) btnReload.addEventListener('click', handleSync)
  const btnEditFood = document.getElementById('btnEditFood')
  if (btnEditFood) btnEditFood.addEventListener('click', handleEditFoodClick)
  const btnNight = document.getElementById('btnNightTest')
  if (btnNight) btnNight.addEventListener('click', handleNightToggle)
  const btnNightSubmit = document.getElementById('btnNightSubmit')
  if (btnNightSubmit) btnNightSubmit.addEventListener('click', handleNightSubmit)
  const btnKcal = document.getElementById('btnEditKcal')
  if (btnKcal) btnKcal.addEventListener('click', () => promptAndStoreNumber('biocore_active_kcal', 'daily active kcal'))
  const btnHr = document.getElementById('btnEditHR')
  if (btnHr) btnHr.addEventListener('click', () => promptAndStoreNumber('biocore_hr', 'heart rate'))
}

function handleSync() {
  const btn = document.getElementById('btnReload')
  if (!isSynced) {
    console.log('Initial Sync...')
    isSynced = true
    if (btn) {
      btn.innerText = 'RELOAD'
      btn.classList.add('synced')
    }
  } else {
    console.log('Reloading data...')
    render()
    renderFineLog()
    refreshMetabolicStatus()
  }
}

function refreshMetabolicStatus(modeOverride) {
  const loopData = metabolicLoop(modeOverride)
  updateMetabolicDisplay(loopData)
  const influxRate = Number(loopData.result.influxRateGPerMin.carbs || 0)
  updateMetabolicChart(formatTimeHHmm(loopData.timestamp), loopData.glycogen, influxRate)
}

function updateMetabolicDisplay(loopData) {
  const { result, glycogen, mode, bmr, activeKcalDay, status } = loopData
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
    tv.innerHTML = `Mode: ${mode}<br>Glycogen: ${glycogen.toFixed(1)}g<br>Blood Influx: ${result.influxRateGPerMin.carbs.toFixed(2)} g/min<br>Status: ${status}<br>BMR: ${Math.round(bmr)} kcal${extra}`
  }
  const tvHR = document.getElementById('tvHR')
  if (tvHR) tvHR.textContent = loopData.hr
  const tvTotalOut = document.getElementById('tvTotalOut')
  const totalOut = Math.round(bmr + (activeKcalDay || 0))
  if (tvTotalOut) tvTotalOut.textContent = `${totalOut} kcal/day`
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

function initMetabolicMode() {
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

function startMetabolicTicker() {
  if (metabolicTimer) return
  metabolicTimer = setInterval(() => refreshMetabolicStatus(), METABOLIC_INTERVAL_MS)
}

function handleNightToggle() {
  const panel = document.getElementById('nightTestPanel')
  if (!panel) return
  panel.classList.toggle('hidden')
}

function handleNightSubmit(ev) {
  ev.preventDefault()
  const eve = Number(document.getElementById('nightEvening')?.value || 0)
  const mor = Number(document.getElementById('nightMorning')?.value || 0)
  if (eve > 0) localStorage.setItem('night_evening_weight', eve)
  if (mor > 0) localStorage.setItem('night_morning_weight', mor)
  console.log('Night test saved', { evening: eve, morning: mor })
  const panel = document.getElementById('nightTestPanel')
  if (panel) panel.style.display = 'none'
}

function initApp() {
  restoreChartHistory()
  attachHandlers()
  initMetabolicChart()
  initMetabolicMode()
  render()
  renderFineLog()
  startFineNutritionTicker()
  refreshMetabolicStatus()
  startMetabolicTicker()
  updateTimes()
  updateStepDisplay()
  setInterval(saveChartHistory, CHART_HISTORY_SAVE_INTERVAL_MS)
  setInterval(updateTimes, 60000)
}

window.Calc = Calc
window.load = load
window.render = render
window.metabolicLoop = metabolicLoop
window.renderFineLog = renderFineLog
window.openJsonModal = openJsonModal
window.closeJsonModal = closeJsonModal
window.handleExportTxt = handleExportTxt
window.handleNightToggle = handleNightToggle
window.handleNightSubmit = handleNightSubmit
window.handleEditFoodClick = handleEditFoodClick
window.handleFormSubmit = handleFormSubmit
Object.assign(window, { handleSync, handleSteps, handleProfile, resetStoredData })

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp)
} else {
  initApp()
}
