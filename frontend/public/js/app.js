const STORAGE_KEY = 'biocore_items'

function $(sel) { return document.querySelector(sel) }

function load() {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : []
}

function save(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) }

function calcCalories(grams, calPer100) {
  return Math.round((grams * calPer100) / 100)
}

// Absorption rates (g/h) and convert to g/min when used
const ABSORPTION_GPH = { fastCarbs: 60.0, slowCarbs: 20.0, proteins: 15.0, fats: 5.0 }

function loadMealsLog() {
  const raw = localStorage.getItem('mealsLog')
  return raw ? JSON.parse(raw) : []
}

function saveMealsLog(list) { localStorage.setItem('mealsLog', JSON.stringify(list)) }

function formatMinutesToHours(mins) {
  if (!Number.isFinite(mins) || mins === Infinity) return '∞'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m} мин.`
  return `${h} ч. ${m} мин.`
}

function updateFineNutritionLog() {
  const meals = loadMealsLog()
  const el = document.getElementById('tvFineNutritionStatus')
  if (!el) return
  // Build monospace log: for each meal show its status and time-to-empty (per-meal absorption)
  const now = Date.now()
  const lines = meals.slice().reverse().map(m => {
    const t = new Date(m.timestamp)
    const time = t.toLocaleTimeString()
    const kcal = Math.round((m.grams * m.calPer100) / 100)
    const fast = Number(m.fastCarbs || 0)
    const slow = Number(m.slowCarbs || 0)
    const prot = Number(m.proteins || 0)
    const fat = Number(m.fats || 0)

    // Compute total absorption duration (minutes) using constants: fast 60 g/h, slow 20 g/h
    const fastDurMin = fast > 0 ? (fast / ABSORPTION_GPH.fastCarbs) * 60 : 0
    const slowDurMin = slow > 0 ? (slow / ABSORPTION_GPH.slowCarbs) * 60 : 0
    const totalDurMin = fastDurMin + slowDurMin

    // Remaining grams to absorb (naive): if now before start, remaining=fast+slow; if during, compute elapsed
    const digestDelay = Number(localStorage.getItem('biocore_digest_delay_min') || 15)
    const startMs = m.timestamp + digestDelay * 60000
    let remainingCarbs = fast + slow
    if (now > startMs && totalDurMin > 0) {
      const elapsedMin = (now - startMs) / 60000
      const absorbedSoFar = Math.min(totalDurMin, elapsedMin) / totalDurMin * (fast + slow)
      remainingCarbs = Math.max(0, (fast + slow) - absorbedSoFar)
    }

    // Time to absorb remaining carbs (minutes) using current absorption capacity for this meal: assume same rate distribution
    // For simplicity compute remaining time = remainingCarbs / currentMealAbsorptionRate(g/min)
    const mealAbsorptionGPerMin = (ABSORPTION_GPH.fastCarbs/60) * (fast / Math.max(1, (fast+slow))) + (ABSORPTION_GPH.slowCarbs/60) * (slow / Math.max(1, (fast+slow)))
    const timeToEmptyMin = mealAbsorptionGPerMin > 0 ? (remainingCarbs / mealAbsorptionGPerMin) : Infinity

    return `${time} | ${m.name} | ${kcal} kcal | carbs ${fast+slow}g | remaining ${Math.round(remainingCarbs)}g | TTE: ${formatMinutesToHours(timeToEmptyMin)}`
  })

  // Blood Influx summary (current per-minute rates across meals)
  let influxC = 0, influxP = 0, influxF = 0
  const now2 = Date.now()
  meals.forEach(m => {
    const digestDelay = Number(localStorage.getItem('biocore_digest_delay_min') || 15)
    const startMs = m.timestamp + digestDelay * 60000
    const fast = Number(m.fastCarbs || 0)
    const slow = Number(m.slowCarbs || 0)
    const prot = Number(m.proteins || 0)
    const fat = Number(m.fats || 0)

    // fast window
    if (fast > 0) {
      const fastDurMs = (fast / ABSORPTION_GPH.fastCarbs) * 3600000
      const fastStart = startMs
      const fastEnd = fastStart + fastDurMs
      if (now2 >= fastStart && now2 <= fastEnd) influxC += (ABSORPTION_GPH.fastCarbs/60)
    }
    // slow window
    if (slow > 0) {
      const slowDurMs = (slow / ABSORPTION_GPH.slowCarbs) * 3600000
      const slowStart = startMs
      const slowEnd = slowStart + slowDurMs
      if (now2 >= slowStart && now2 <= slowEnd) influxC += (ABSORPTION_GPH.slowCarbs/60)
    }
    if (prot > 0) {
      const protDurMs = (prot / ABSORPTION_GPH.proteins) * 3600000
      const pStart = startMs
      const pEnd = pStart + protDurMs
      if (now2 >= pStart && now2 <= pEnd) influxP += (ABSORPTION_GPH.proteins/60)
    }
    if (fat > 0) {
      const fDurMs = (fat / ABSORPTION_GPH.fats) * 3600000
      const fStart = startMs
      const fEnd = fStart + fDurMs
      if (now2 >= fStart && now2 <= fEnd) influxF += (ABSORPTION_GPH.fats/60)
    }
  })

  const influxLine = `Blood Influx — carbs: ${influxC.toFixed(2)} g/min | protein: ${influxP.toFixed(2)} g/min | fats: ${influxF.toFixed(2)} g/min`
  el.textContent = lines.join('\n') + '\n\n' + influxLine
}

// Return human-friendly relative time string (BG)
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

function updateTimes() {
  const nodes = document.querySelectorAll('td[data-ts]')
  nodes.forEach(n => {
    const ts = Number(n.getAttribute('data-ts')) || 0
    n.textContent = getRelativeTime(ts)
  })
}

function render() {
  const items = load()
  // sort newest first
  items.sort((a,b) => (b.timestamp||0) - (a.timestamp||0))
  const tbody = $('#list tbody')
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
  $('#total').textContent = total
  // start live fine-nutrition updater (every 5 seconds)
  updateFineNutritionLog()
  setInterval(updateFineNutritionLog, 5000)
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-idx]')
  if (!btn) return
  const idx = Number(btn.dataset.idx)
  const items = load()
  items.splice(idx, 1)
  save(items)
  render()
})
// btnEditFood: scroll to form and focus #foodName
const btnF = document.getElementById('btnEditFood')
if (btnF) btnF.addEventListener('click', () => {
  const f = document.getElementById('foodForm')
  const name = document.getElementById('foodName')
  if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (name) {
    name.focus()
  }
})

document.getElementById('foodForm').addEventListener('submit', (e) => {
  e.preventDefault()
  const name = $('#foodName').value.trim()
  const grams = Number($('#grams').value) || 0
  const calPer100 = Number($('#calPer100').value) || 0
  if (!name || grams <= 0) return
  const items = load()
  const entry = { name, grams, calPer100, timestamp: Date.now() }
  items.push(entry)
  save(items)
  render()
  e.target.reset()
  // Add to meals log for fine nutrition
  const kcal = Math.round((grams * calPer100) / 100)
  const carbsEst = Math.round((kcal * 0.5) / 4)
  const meals = loadMealsLog()
  meals.push({ name, grams, calPer100, timestamp: Date.now(), kcal, carbsGrams: carbsEst })
  saveMealsLog(meals)
  updateFineNutritionLog()
})

render()

// Live update relative times every minute
setInterval(updateTimes, 60000)
