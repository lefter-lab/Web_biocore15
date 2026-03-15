console.log('DEBUG: Biocore app.js initializing')

const STORAGE_KEY = 'biocore_items'
const MEALS_LOG_KEY = 'biocore_meals_log'
const FINE_LOG_INTERVAL_MS = 5000
const METABOLIC_INTERVAL_MS = 5000
const MAX_CHART_POINTS = 24
const CHART_LIMIT_LINE = 500
const CHART_HISTORY_KEY = 'biocore_chart_history'
const CHART_HISTORY_SAVE_INTERVAL_MS = 60000

const jsonModal = document.getElementById('jsonModal')
const jsonList = document.getElementById('jsonList')
const jsonFileInput = document.getElementById('jsonFileInput')
const btnExportTxt = document.getElementById('btnExportTxt')
const btnCloseJson = document.getElementById('btnCloseJson')
const fitnessStatusNode = document.getElementById('tvFineNutritionStatus')
const metabolicCanvas = document.getElementById('metabolicChart')

let fineNutritionTimer = null
let metabolicTimer = null
let metabolicChartInstance = null
const chartHistory = { labels: [], glycogen: [], influx: [] }
let isSynced = false
let lastInfluxRate = 0
let lastBurnRate = 0

function $(selector) {
  return document.querySelector(selector)
}

function safeParseJson(value, fallback = []) {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch (err) {
    console.warn('Biocore: failed to parse JSON', err)
    return fallback
  }
}

function calcCalories(grams = 0, calPer100 = 0) {
  const g = Number(grams) || 0
  const c = Number(calPer100) || 0
  return Math.round((g * c) / 100)
}

function getRelativeTime(timestamp) {
  if (!timestamp) return ''
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Току-що'
  if (diffMin < 60) return `преди ${diffMin} минути`
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  if (mins === 0) return `преди ${hours} ч.`
  return `преди ${hours} ч. и ${mins} мин.`
}

function formatTimeHHmm(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function sameLocalDate(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
}

function load() {
  return safeParseJson(localStorage.getItem(STORAGE_KEY), [])
}

function save(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function normalizeFineMeal(source = {}) {
  const now = Date.now()
  const name = source.name || source.foodName || 'meal'
  const grams = Number(source.grams) || 0
  const calPer100 = Number(source.calPer100) || 0
  const timestamp = Number(source.timestamp) || now
  const fastCarbs = Number(source.fastCarbs) || 0
  const slowCarbs = Number(source.slowCarbs) || 0
  const proteins = Number(source.proteins) || 0
  const fats = Number(source.fats) || 0
  const kcal = Number(source.kcal) || Math.round((grams * calPer100) / 100)
  return {
    name,
    grams,
    calPer100,
    timestamp,
    kcal,
    fastCarbs,
    slowCarbs,
    proteins,
    fats,
    remainingFast: Number.isFinite(source.remainingFast) ? Number(source.remainingFast) : fastCarbs,
    remainingSlow: Number.isFinite(source.remainingSlow) ? Number(source.remainingSlow) : slowCarbs,
    remainingProt: Number.isFinite(source.remainingProt) ? Number(source.remainingProt) : proteins,
    remainingFat: Number.isFinite(source.remainingFat) ? Number(source.remainingFat) : fats
  }
}

function loadMealsLog() {
  const raw = localStorage.getItem(MEALS_LOG_KEY)
  if (!raw) {
    const fallback = load().map((item) => normalizeFineMeal(item))
    if (fallback.length) {
      saveMealsLog(fallback)
    }
    return fallback
  }
  return safeParseJson(raw, []).map((item) => normalizeFineMeal(item))
}

function saveMealsLog(meals) {
  localStorage.setItem(MEALS_LOG_KEY, JSON.stringify(meals))
}

function renderJsonList(dateObj) {
  const meals = loadMealsLog()
  const lines = meals
    .filter((m) => m.timestamp && sameLocalDate(new Date(m.timestamp), dateObj))
    .map((m) => `${formatTimeHHmm(m.timestamp)} ${m.name} ${m.grams} g`)
  if (jsonList) jsonList.textContent = lines.join('\n') || '(no meals)'
}

function updateJsonList() {
  renderJsonList(new Date())
}

function openJsonModal() {
  if (!jsonModal) return
  jsonModal.style.display = 'block'
  updateJsonList()
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
        updateFineNutritionLog()
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

function formatMacroValue(value) {
  return Math.round((value || 0) * 10) / 10
}

function formatRate(value) {
  return Number(value || 0).toFixed(2)
}

function loadChartHistoryStore() {
  const raw = localStorage.getItem(CHART_HISTORY_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.warn('Biocore: invalid chart history payload', err)
    return null
  }
}

function restoreChartHistory() {
  const stored = loadChartHistoryStore()
  if (!stored) return
  const storedLabels = Array.isArray(stored.labels) ? stored.labels : []
  const storedGlycogen = Array.isArray(stored.glycogen) ? stored.glycogen : []
  const storedInflux = Array.isArray(stored.influx) ? stored.influx : []
  const actualSize = Math.min(MAX_CHART_POINTS, storedLabels.length, storedGlycogen.length, storedInflux.length)
  if (actualSize <= 0) return
  chartHistory.labels = storedLabels.slice(-actualSize)
  chartHistory.glycogen = storedGlycogen.slice(-actualSize)
  chartHistory.influx = storedInflux.slice(-actualSize)
}

function saveChartHistory() {
  localStorage.setItem(CHART_HISTORY_KEY, JSON.stringify({
    labels: chartHistory.labels,
    glycogen: chartHistory.glycogen,
    influx: chartHistory.influx
  }))
}

function getLimitSeries() {
  return Array(chartHistory.labels.length).fill(CHART_LIMIT_LINE)
}

        },
        {
  const meals = loadMealsLog()
  const totals = { fast: 0, slow: 0, prot: 0, fat: 0 }
  meals.forEach((meal) => {
    totals.fast += meal.remainingFast || 0
    totals.slow += meal.remainingSlow || 0
    totals.prot += meal.remainingProt || 0
    totals.fat += meal.remainingFat || 0
  })
  const recent = meals
    .slice(-4)
    .reverse()
    .map((meal) => {
      const time = formatTimeHHmm(meal.timestamp)
      const macros = []
      if (meal.remainingFast) macros.push(`Fast ${formatMacroValue(meal.remainingFast)}g`)
      if (meal.remainingSlow) macros.push(`Slow ${formatMacroValue(meal.remainingSlow)}g`)
      if (meal.remainingProt) macros.push(`Prot ${formatMacroValue(meal.remainingProt)}g`)
      if (meal.remainingFat) macros.push(`Fat ${formatMacroValue(meal.remainingFat)}g`)
      if (!macros.length) macros.push('complete')
      return `${time} ${meal.name}: ${macros.join(' | ')}`
    })
  const totalBloodInflux = formatRate(lastInfluxRate)
  const netChange = lastInfluxRate - lastBurnRate
  const netLabel = `${netChange >= 0 ? '+' : '-'}${Math.abs(netChange).toFixed(2)}`
  const summary = [
    `Entries ${meals.length}`,
    `Remaining carbs: Fast ${formatMacroValue(totals.fast)}g / Slow ${formatMacroValue(totals.slow)}g`,
    `Protein ${formatMacroValue(totals.prot)}g • Fat ${formatMacroValue(totals.fat)}g`,
    `TOTAL BLOOD INFLUX: ${totalBloodInflux} g/min`,
    `NET GLYCOGEN CHANGE: ${netLabel} g/min (разликата между Influx и Burn)`
  ]
  const lines = [...summary]
  if (recent.length) {
    lines.push('', 'Recent meals:')
    lines.push(...recent)
  }
  fitnessStatusNode.textContent = lines.join('\n')
}

function startFineNutritionTicker() {
  if (fineNutritionTimer) return
  fineNutritionTimer = setInterval(updateFineNutritionLog, FINE_LOG_INTERVAL_MS)
}

function initMetabolicChart() {
  if (!metabolicCanvas || typeof Chart === 'undefined') return
  metabolicChartInstance = new Chart(metabolicCanvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: [...chartHistory.labels],
      datasets: [
        {
          label: 'Glycogen (g)',
          borderColor: '#2a9d8f',
          backgroundColor: 'rgba(42,157,143,0.2)',
          data: [...chartHistory.glycogen],
          yAxisID: 'glycogenAxis',
          tension: 0.4
        },
        {
          label: 'Influx (g/min)',
          borderColor: '#f4a261',
          backgroundColor: 'rgba(244,162,97,0.2)',
          data: [...chartHistory.influx],
          yAxisID: 'influxAxis',
          tension: 0.4
        },
        {
          label: 'Glycogen Limit',
          borderColor: '#ff4d4f',
          borderDash: [6, 4],
          data: getLimitSeries(),
          yAxisID: 'glycogenAxis',
          pointRadius: 0,
          borderWidth: 1,
          fill: false,
          tension: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        glycogenAxis: {
          type: 'linear',
          position: 'left',
          ticks: { color: '#2a9d8f' }
        },
        influxAxis: {
          type: 'linear',
          position: 'right',
          ticks: { color: '#f4a261' }
        }
      }
    }
  })
}

function pushMetabolicHistory(label, glycogenValue, influxValue) {
  if (!metabolicChartInstance) return
  chartHistory.labels.push(label)
  chartHistory.glycogen.push(glycogenValue)
  chartHistory.influx.push(influxValue)
  if (chartHistory.labels.length > MAX_CHART_POINTS) {
    chartHistory.labels.shift()
    chartHistory.glycogen.shift()
    chartHistory.influx.shift()
  }
  metabolicChartInstance.data.labels = [...chartHistory.labels]
  metabolicChartInstance.data.datasets[0].data = [...chartHistory.glycogen]
  metabolicChartInstance.data.datasets[1].data = [...chartHistory.influx]
  metabolicChartInstance.data.datasets[2].data = getLimitSeries()
  metabolicChartInstance.update('none')
  saveChartHistory()
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
    updateFineNutritionLog()
    metabolicLoop()
  }
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
  updateFineNutritionLog()
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
  updateFineNutritionLog()
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
  const btnJson = document.getElementById('btnJson')
  if (btnJson) btnJson.addEventListener('click', openJsonModal)
  if (btnCloseJson) btnCloseJson.addEventListener('click', closeJsonModal)
  if (btnExportTxt) btnExportTxt.addEventListener('click', handleExportTxt)
  if (jsonFileInput) jsonFileInput.addEventListener('change', handleJsonImport)
  const resetBtn = document.getElementById('btnResetData')
  if (resetBtn) resetBtn.addEventListener('click', resetStoredData)
  const form = document.getElementById('foodForm')
  if (form) form.addEventListener('submit', handleFormSubmit)
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

function render() {
  const items = load()
  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  const tbody = document.querySelector('#list tbody')
  if (!tbody) return
  tbody.innerHTML = ''
  let total = 0
  items.forEach((it, idx) => {
    const tr = document.createElement('tr')
    const cal = calcCalories(it.grams, it.calPer100)
    total += cal
    const ts = it.timestamp || 0
    const timeText = ts ? getRelativeTime(ts) : ''
    tr.innerHTML = `<td data-ts="${ts}">${timeText}</td><td>${it.name}</td><td>${it.grams}</td><td>${cal}</td><td><button data-idx="${idx}">X</button></td>`
    tbody.appendChild(tr)
  })
  const totalEl = document.getElementById('total')
  if (totalEl) totalEl.textContent = total
}

function metabolicLoop() {
  const meals = loadMealsLog()
  const now = Date.now()
  let result = { absorbedGrams: { carbs: 0, protein: 0, fats: 0 }, influxRateGPerMin: { carbs: 0, protein: 0, fats: 0 } }
  if (window.Calc && typeof window.Calc.absorbMealsForInterval === 'function') {
    result = window.Calc.absorbMealsForInterval(meals, now, 5)
  }
  saveMealsLog(meals)
  const glycKey = 'biocore_glycogen'
  const fatKey = 'biocore_fat_from_carbs'
  let glyc = Number(localStorage.getItem(glycKey) || 0)
  let fatFromCarbs = Number(localStorage.getItem(fatKey) || 0)
  const absorbedCarbs = result.absorbedGrams.carbs || 0
  const spill = window.Calc
    ? window.Calc.calculateGlycogenUpdate(glyc, absorbedCarbs)
    : { newGlycogen: glyc + absorbedCarbs, addedToFat: 0 }
  glyc = spill.newGlycogen
  fatFromCarbs += spill.addedToFat
  localStorage.setItem(glycKey, glyc)
  localStorage.setItem(fatKey, fatFromCarbs)
  const hr = Number(localStorage.getItem('biocore_hr') || 70)
  const weight = Number(localStorage.getItem('biocore_weight') || 70)
  const height = Number(localStorage.getItem('biocore_height') || 170)
  const age = Number(localStorage.getItem('biocore_age') || 30)
  const gender = localStorage.getItem('biocore_gender') || 'male'
  const activeKcalDay = Number(localStorage.getItem('biocore_active_kcal') || 0)
  const bmr = window.Calc ? window.Calc.calculateBMR(weight, height, age, gender) : 0
  const selectMode = document.getElementById('metabolicMode')
  const mode = localStorage.getItem('biocore_mode') || (selectMode ? selectMode.value : 'Maintenance')
  const burnGPerMin = window.Calc ? window.Calc.calculateMinuteBurn(hr, bmr, activeKcalDay, mode) : 0
  lastBurnRate = burnGPerMin
  lastInfluxRate = Number(result.influxRateGPerMin.carbs || 0)
  const tv = document.getElementById('tvMetabolicStatus')
  if (tv) {
    const status = (result.influxRateGPerMin.carbs > burnGPerMin) ? 'STORING ENERGY' : 'BURNING FAT'
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
    tv.innerHTML = `Mode: ${mode}<br>Glycogen: ${glyc.toFixed(1)}g<br>Blood Influx: ${result.influxRateGPerMin.carbs.toFixed(2)} g/min<br>Status: ${status}<br>BMR: ${Math.round(bmr)} kcal${extra}`
  }
  const tvHR = document.getElementById('tvHR')
  if (tvHR) tvHR.textContent = hr
  const tvTotalOut = document.getElementById('tvTotalOut')
  if (tvTotalOut) tvTotalOut.textContent = `${Math.round(bmr + (activeKcalDay || 0))} kcal/day`
  const tvDailyBalance = document.getElementById('tvDailyBalance')
  if (tvDailyBalance) {
    const totalIn = Number(document.getElementById('total')?.textContent || 0)
    const totalOut = Math.round(bmr + (activeKcalDay || 0))
    tvDailyBalance.textContent = `${totalIn - totalOut} kcal`
  }
  const tvActive = document.getElementById('tvActiveKcal')
  if (tvActive) tvActive.textContent = `${Math.round(activeKcalDay)} kcal`
  const tvTopMet = document.getElementById('tvTopMetabolic')
  if (tvTopMet) tvTopMet.textContent = `Glycogen ${glyc.toFixed(0)}g • Influx ${result.influxRateGPerMin.carbs.toFixed(2)} g/min`
  const glycBar = document.getElementById('glycogenBar')
  if (glycBar) {
    const pct = Math.min(100, (glyc / 500) * 100)
    glycBar.style.width = pct + '%'
    glycBar.textContent = `${glyc.toFixed(1)} g`
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
  pushMetabolicHistory(formatTimeHHmm(now), glyc, lastInfluxRate)
  updateFineNutritionLog()
}

function startMetabolicTicker() {
  if (metabolicTimer) return
  metabolicTimer = setInterval(metabolicLoop, METABOLIC_INTERVAL_MS)
}

function initMetabolicMode() {
  const metabolicSelect = document.getElementById('metabolicMode')
  if (!metabolicSelect) return
  const stored = localStorage.getItem('biocore_mode')
  if (stored) metabolicSelect.value = stored
  metabolicSelect.addEventListener('change', (ev) => {
    const value = ev.target.value
    localStorage.setItem('biocore_mode', value)
    metabolicLoop()
  })
}

function updateTimes() {
  const nodes = document.querySelectorAll('td[data-ts]')
  nodes.forEach((n) => {
    const ts = Number(n.getAttribute('data-ts')) || 0
    n.textContent = getRelativeTime(ts)
  })
}

restoreChartHistory()
attachHandlers()
initMetabolicChart()
initMetabolicMode()
render()
updateFineNutritionLog()
startFineNutritionTicker()
metabolicLoop()
startMetabolicTicker()
updateTimes()
setInterval(saveChartHistory, CHART_HISTORY_SAVE_INTERVAL_MS)
setInterval(updateTimes, 60000)
