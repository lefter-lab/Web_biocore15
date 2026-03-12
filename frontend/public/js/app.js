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

function render() {
  const items = load()
  const tbody = $('#list tbody')
  tbody.innerHTML = ''
  let total = 0
  items.forEach((it, idx) => {
    const tr = document.createElement('tr')
    const cal = calcCalories(it.grams, it.calPer100)
    total += cal
    tr.innerHTML = `<td>${it.name}</td><td>${it.grams}</td><td>${cal}</td><td><button data-idx="${idx}">X</button></td>`
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
  items.push({ name, grams, calPer100 })
  save(items)
  render()
  e.target.reset()
})

render()
