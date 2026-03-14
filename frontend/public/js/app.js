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

// Absorption rates mirror frontend/src/js/calc.js (g/min)
const ABSORPTION_RATES = { fastCarbs: 1.0, slowCarbs: 0.33, proteins: 0.25, fats: 0.08 }

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
  // Build monospace log: each line "[time] name — X kcal — carbs Y g"
  const lines = meals.slice().reverse().map(m => {
    const time = new Date(m.timestamp).toLocaleTimeString()
    const kcal = Math.round((m.grams * m.calPer100) / 100)
    const carbs = m.carbsGrams != null ? m.carbsGrams : Math.round((kcal * 0.5) / 4)
    return `${time} | ${m.name} | ${kcal} kcal | carbs ${carbs} g`
  })

  // Compute Time to Empty (approx): glycogen / (burn - absorption)
  const glycogen = Number(localStorage.getItem('biocore_glycogen') || 300)
  const hr = Number(localStorage.getItem('biocore_hr') || 75)
  const active = Number(localStorage.getItem('biocore_active_kcal') || 0)
  const bmr = Number(localStorage.getItem('biocore_bmr') || 1500)
  const burnGPerMin = calculateMinuteBurnLocal(hr, bmr, active)
  const absorptionPerMin = meals.length * ABSORPTION_RATES.slowCarbs
  let timeToEmptyText = ''
  const net = burnGPerMin - absorptionPerMin
  if (net <= 0) timeToEmptyText = 'Time to Empty: replenishing (≤0 net)'
  else {
    const mins = glycogen / net
    timeToEmptyText = 'Time to Empty: ' + formatMinutesToHours(mins)
  }

  el.textContent = lines.join('\n') + '\n\n' + timeToEmptyText
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
