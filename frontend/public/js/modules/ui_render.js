import { CHART_HISTORY_KEY, load, loadMealsLog } from './storage.js'
import { chartHistory, pushMetabolicHistory, lastBurnRate, lastInfluxRate } from './engine.js'

const CHART_LIMIT_LINE = 500
const STEP_GOAL = 10000
const MAX_CHART_POINTS = 24

const fitnessStatusNode = document.getElementById('tvFineNutritionStatus')
const metabolicCanvas = document.getElementById('metabolicChart')
let metabolicChartInstance = null
let fineNutritionTimer = null

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

export function formatTimeHHmm(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatMacroValue(value) {
  return Math.round((value || 0) * 10) / 10
}

function formatRate(value) {
  return Number(value || 0).toFixed(2)
}

function getLimitSeries() {
  return Array(chartHistory.labels.length).fill(CHART_LIMIT_LINE)
}

export function render() {
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

export function renderFineLog() {
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
  if (fitnessStatusNode) fitnessStatusNode.textContent = lines.join('\n')
}

export function updateStepDisplay(stepsValue) {
  const stored = localStorage.getItem('biocore_steps')
  const steps = Number(stepsValue ?? stored) || 0
  const tvStepCount = document.getElementById('tvStepCount')
  if (tvStepCount) tvStepCount.textContent = `Стъпки: ${steps}`
  const stepBar = document.getElementById('stepBar')
  if (stepBar) {
    const pct = Math.min(100, (steps / STEP_GOAL) * 100)
    stepBar.style.width = `${pct}%`
  }
}

export function initMetabolicChart() {
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

export function updateMetabolicChart(label, glycogenValue, influxValue) {
  pushMetabolicHistory(label, glycogenValue, influxValue, MAX_CHART_POINTS)
  if (!metabolicChartInstance) return
  metabolicChartInstance.data.labels = [...chartHistory.labels]
  metabolicChartInstance.data.datasets[0].data = [...chartHistory.glycogen]
  metabolicChartInstance.data.datasets[1].data = [...chartHistory.influx]
  metabolicChartInstance.data.datasets[2].data = getLimitSeries()
  metabolicChartInstance.update('none')
}

export function startFineNutritionTicker() {
  if (fineNutritionTimer) return
  fineNutritionTimer = setInterval(renderFineLog, 5000)
}

export function stopFineNutritionTicker() {
  if (!fineNutritionTimer) return
  clearInterval(fineNutritionTimer)
  fineNutritionTimer = null
}

export function loadChartHistoryStore() {
  const raw = localStorage.getItem(CHART_HISTORY_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.warn('Biocore: invalid chart history payload', err)
    return null
  }
}

export function restoreChartHistory() {
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

export function saveChartHistory() {
  localStorage.setItem(CHART_HISTORY_KEY, JSON.stringify({
    labels: chartHistory.labels,
    glycogen: chartHistory.glycogen,
    influx: chartHistory.influx
  }))
}

export function updateTimes() {
  const nodes = document.querySelectorAll('td[data-ts]')
  nodes.forEach((n) => {
    const ts = Number(n.getAttribute('data-ts')) || 0
    n.textContent = getRelativeTime(ts)
  })
}

