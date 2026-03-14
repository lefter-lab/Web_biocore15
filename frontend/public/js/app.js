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

document.getElementById('foodForm').addEventListener('submit', (e) => {
  e.preventDefault()
  const name = $('#name').value.trim()
  const grams = Number($('#grams').value) || 0
  const calPer100 = Number($('#calPer100').value) || 0
  if (!name || grams <= 0) return
  const items = load()
  items.push({ name, grams, calPer100, timestamp: Date.now() })
  save(items)
  render()
  e.target.reset()
})

render()

// Live update relative times every minute
setInterval(updateTimes, 60000)
