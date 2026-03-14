const STORAGE_KEY = 'biocore_items'

// Sync state
let isSynced = false

function $(sel) { return document.querySelector(sel) }

function load() {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : []
}

// JSON modal handlers
const btnJson = document.getElementById('btnJson')
const jsonModal = document.getElementById('jsonModal')
const jsonList = document.getElementById('jsonList')
const jsonFileInput = document.getElementById('jsonFileInput')
const btnExportTxt = document.getElementById('btnExportTxt')
const btnCloseJson = document.getElementById('btnCloseJson')

function openJsonModal() {
  if (!jsonModal) return
  jsonModal.style.display = 'block'
  renderJsonList(new Date())
}
function closeJsonModal() {
  if (!jsonModal) return
  jsonModal.style.display = 'none'
}
if (btnJson) btnJson.addEventListener('click', openJsonModal)
if (btnCloseJson) btnCloseJson.addEventListener('click', closeJsonModal)

function formatTimeHHmm(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function sameLocalDate(d1, d2) {
  return d1.getFullYear()===d2.getFullYear() && d1.getMonth()===d2.getMonth() && d1.getDate()===d2.getDate()
}

function renderJsonList(dateObj) {
  const meals = loadMealsLog()
  const lines = meals.filter(m => {
    if (!m.timestamp) return false
    return sameLocalDate(new Date(m.timestamp), dateObj)
  }).map(m => `${formatTimeHHmm(m.timestamp)} ${m.name || m.foodName || ''} ${m.grams||''} g`)
  if (jsonList) jsonList.textContent = lines.join('\n') || '(no meals)'
}

// compatibility wrapper the UI expects
function updateJsonList() {
  renderJsonList(new Date())
}

// ensure the JSON open/close handlers exist exactly as requested
const btnJsonEl = document.getElementById('btnJson')
if (btnJsonEl) btnJsonEl.addEventListener('click', () => {
  const modal = document.getElementById('jsonModal')
  if (modal) modal.style.display = 'block'
  updateJsonList()
})
const btnCloseJsonEl = document.getElementById('btnCloseJson')
if (btnCloseJsonEl) btnCloseJsonEl.addEventListener('click', () => {
  const modal = document.getElementById('jsonModal')
  if (modal) modal.style.display = 'none'
})

// Export TXT by selected date
if (btnExportTxt) btnExportTxt.addEventListener('click', () => {
  const targetDate = document.getElementById('exportDate')?.value
  const mealsLog = loadMealsLog()
  const dateToMatch = targetDate || new Date().toISOString().split('T')[0]
  const filtered = mealsLog.filter(m => m.timestamp && new Date(m.timestamp).toISOString().split('T')[0] === dateToMatch)

  let output = filtered.map(m => {
    const time = new Date(m.timestamp).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
    return `${time} ${m.name || m.foodName || ''} ${m.grams || ''} g`
  }).join('\n')

  const blob = new Blob([output], { type: 'text/plain' })
  const anchor = document.createElement('a')
  anchor.download = `meals_${dateToMatch}.txt`
  anchor.href = window.URL.createObjectURL(blob)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(anchor.href)
})

// JSON import handler
if (jsonFileInput) jsonFileInput.addEventListener('change', (ev) => {
  const f = ev.target.files && ev.target.files[0]
  if (!f) return
  const reader = new FileReader()
  reader.onload = function(e) {
    try {
      const txt = e.target.result
      const parsed = JSON.parse(txt)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      const meals = loadMealsLog()
      let added = 0, skipped = 0
      arr.forEach(it => {
        const ts = Number(it.timestamp) || Date.now()
        const name = it.foodName || it.name || 'imported'
        const fast = Number(it.fastCarbs) || 0
        const slow = Number(it.slowCarbs) || 0
        const proteins = Number(it.proteins) || 0
        const fats = Number(it.fats) || 0
        const kcal = Number(it.kcal) || 0
        if (isNaN(ts) || (!name)) { skipped++; return }
        // ensure at least one macro exists
        if (fast===0 && slow===0 && proteins===0 && fats===0) { skipped++; return }
        const entry = { name, grams: (it.grams||0), calPer100: (it.calPer100||0), timestamp: ts }
        // add fine meal fields
        const fine = { name, grams: (it.grams||0), calPer100: (it.calPer100||0), timestamp: ts, kcal, fastCarbs: fast, slowCarbs: slow, proteins, fats, remainingFast: fast, remainingSlow: slow, remainingProt: proteins, remainingFat: fats }
        meals.push(fine)
        added++
      })
      saveMealsLog(meals)
      updateFineNutritionLog()
      render()
      renderJsonList(new Date())
      console.log(`Imported ${added} items, skipped ${skipped}`)
    } catch (err) {
      console.error('Import failed', err)
    }
  }
  reader.readAsText(f)
})

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
// handleSync implementation
function handleSync() {
  const btn = document.getElementById('btnReload')
  if (!isSynced) {
    console.log("Initial Sync...")
    isSynced = true
    if (btn) {
      btn.innerText = "RELOAD"
      btn.classList.add('synced')
    }
  } else {
    console.log("Reloading data...")
    // refresh UI data
    render()
    updateFineNutritionLog()
    metabolicLoop()
  }
}
const btnReload = document.getElementById('btnReload')
if (btnReload) btnReload.addEventListener('click', handleSync)
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

// Night test toggle and submit handlers
const btnNight = document.getElementById('btnNightTest')
if (btnNight) btnNight.addEventListener('click', () => {
  const panel = document.getElementById('nightTestPanel')
  if (!panel) return
  panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none'
})
const btnNightSubmit = document.getElementById('btnNightSubmit')
if (btnNightSubmit) btnNightSubmit.addEventListener('click', (ev) => {
  ev.preventDefault()
  const eve = Number(document.getElementById('nightEvening')?.value || 0)
  const mor = Number(document.getElementById('nightMorning')?.value || 0)
  if (eve > 0) localStorage.setItem('night_evening_weight', eve)
  if (mor > 0) localStorage.setItem('night_morning_weight', mor)
  console.log('Night test saved', { evening: eve, morning: mor })
  const panel = document.getElementById('nightTestPanel')
  if (panel) panel.style.display = 'none'
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
