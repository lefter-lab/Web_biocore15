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

    // Prefer remaining fields if metabolic loop has initialized them
    let remainingCarbs = (Number(m.remainingFast)||0) + (Number(m.remainingSlow)||0)
    if (remainingCarbs === 0) {
      const digestDelay = Number(localStorage.getItem('biocore_digest_delay_min') || 15)
      const startMs = m.timestamp + digestDelay * 60000
      remainingCarbs = fast + slow
      if (now > startMs && totalDurMin > 0) {
        const elapsedMin = (now - startMs) / 60000
        const absorbedSoFar = Math.min(totalDurMin, elapsedMin) / totalDurMin * (fast + slow)
        remainingCarbs = Math.max(0, (fast + slow) - absorbedSoFar)
      }
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
  // Also update the bottom Blood Influx UI if present
  const tvBI = document.getElementById('tvBloodInflux')
  if (tvBI) tvBI.textContent = `Blood Influx: ${influxC.toFixed(2)} g/min`
}

// Metabolic engine loop: absorbs from meals into glycogen and handles spillover
function metabolicLoop() {
  const meals = loadMealsLog()
  const now = Date.now()
  // Use window.Calc if available, otherwise fallback to local logic
  let result = { absorbedGrams: { carbs:0, protein:0, fats:0 }, influxRateGPerMin: { carbs:0, protein:0, fats:0 } }
  if (window.Calc && typeof window.Calc.absorbMealsForInterval === 'function') {
    result = window.Calc.absorbMealsForInterval(meals, now, 5)
  }
  // Persist mutated meals (remaining* updated)
  saveMealsLog(meals)

  // Glycogen and fat storage in localStorage
  const glycKey = 'biocore_glycogen'
  const fatKey = 'biocore_fat_from_carbs'
  let glyc = Number(localStorage.getItem(glycKey) || 0)
  let fatFromCarbs = Number(localStorage.getItem(fatKey) || 0)

  // Add absorbed carbs to glycogen (grams)
  const absorbedCarbs = result.absorbedGrams.carbs || 0
  const spill = window.Calc ? window.Calc.calculateGlycogenUpdate(glyc, absorbedCarbs) : { newGlycogen: glyc + absorbedCarbs, addedToFat: 0 }
  glyc = spill.newGlycogen
  fatFromCarbs += spill.addedToFat
  localStorage.setItem(glycKey, glyc)
  localStorage.setItem(fatKey, fatFromCarbs)

  // Compute current burn (g/min carbs) from stored user HR and BMR data
  const hr = Number(localStorage.getItem('biocore_hr') || 70)
  const weight = Number(localStorage.getItem('biocore_weight') || 70)
  const height = Number(localStorage.getItem('biocore_height') || 170)
  const age = Number(localStorage.getItem('biocore_age') || 30)
  const gender = localStorage.getItem('biocore_gender') || 'male'
  const activeKcalDay = Number(localStorage.getItem('biocore_active_kcal') || 0)
  const bmr = window.Calc ? window.Calc.calculateBMR(weight, height, age, gender) : 0
  const burnGPerMin = window.Calc ? window.Calc.calculateMinuteBurn(hr, bmr, activeKcalDay) : 0

  // Update metabolic UI
  const tv = document.getElementById('tvMetabolicStatus')
  if (tv) {
    const status = (result.influxRateGPerMin.carbs > burnGPerMin) ? 'STORING ENERGY' : 'BURNING FAT'
    tv.innerHTML = `Glycogen: ${glyc.toFixed(1)}g<br>Blood Influx: ${result.influxRateGPerMin.carbs.toFixed(2)} g/min<br>Status: ${status}<br>BMR: ${Math.round(bmr)} kcal`
  }

  // Update top cards
  const tvHR = document.getElementById('tvHR')
  if (tvHR) tvHR.textContent = hr
  const tvTotalOut = document.getElementById('tvTotalOut')
  if (tvTotalOut) tvTotalOut.textContent = `${Math.round(bmr + (activeKcalDay||0))} kcal/day`
  const tvDailyBalance = document.getElementById('tvDailyBalance')
  if (tvDailyBalance) {
    const totalIn = Number(document.getElementById('total')?.textContent || 0)
    const totalOut = Math.round((bmr + (activeKcalDay||0)))
    tvDailyBalance.textContent = `${totalIn - totalOut} kcal`
  }
  const tvActive = document.getElementById('tvActiveKcal')
  if (tvActive) tvActive.textContent = `${Math.round(activeKcalDay)} kcal`
  const tvTopMet = document.getElementById('tvTopMetabolic')
  if (tvTopMet) tvTopMet.textContent = `Glycogen ${glyc.toFixed(0)}g • Influx ${result.influxRateGPerMin.carbs.toFixed(2)} g/min`

  // Update Glycogen tank progress visual if present
  const glycBar = document.getElementById('glycogenBar')
  if (glycBar) {
    const pct = Math.min(100, (glyc / 500) * 100)
    glycBar.style.width = pct + '%'
    glycBar.textContent = `${glyc.toFixed(1)} g`
  }
}

// Start metabolic loop every 5 seconds
setInterval(metabolicLoop, 5000)
// Run once on load
metabolicLoop()

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
  const fast = Number($('#fastCarbs').value) || 0
  const slow = Number($('#slowCarbs').value) || 0
  const prot = Number($('#proteins').value) || 0
  const fat = Number($('#fats').value) || 0
  if (!name || grams <= 0) return
  const items = load()
  const entry = { name, grams, calPer100, timestamp: Date.now() }
  items.push(entry)
  save(items)
  render()
  e.target.reset()
  // Add to meals log for fine nutrition
  const kcal = Math.round((grams * calPer100) / 100)
  const meals = loadMealsLog()
  meals.push({ name, grams, calPer100, timestamp: Date.now(), kcal, fastCarbs: fast, slowCarbs: slow, proteins: prot, fats: fat, remainingFast: fast, remainingSlow: slow, remainingProt: prot, remainingFat: fat })
  saveMealsLog(meals)
  updateFineNutritionLog()
})

render()

// Live update relative times every minute
setInterval(updateTimes, 60000)
