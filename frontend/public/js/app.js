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
    tr.innerHTML = `<td>${it.name}</td><td>${it.grams}</td><td>${cal}</td><td><button data-idx="${idx}" class="delete">X</button> <button data-edit="${idx}" class="edit">Edit</button></td>`
    tbody.appendChild(tr)
  })
  $('#total').textContent = total
  // also update metabolic panel default active kcal (use total as rough proxy)
  if (document.getElementById('inputActive')) {
    document.getElementById('inputActive').value = total
  }
}

document.addEventListener('click', (e) => {
  const del = e.target.closest('button.delete')
  if (del) {
    const idx = Number(del.dataset.idx)
    const items = load()
    items.splice(idx, 1)
    save(items)
    render()
    return
  }

  const edit = e.target.closest('button.edit')
  if (edit) {
    const idx = Number(edit.dataset.edit)
    const items = load()
    const it = items[idx]
    if (!it) return
    // populate form for editing
    $('#name').value = it.name
    $('#grams').value = it.grams
    $('#calPer100').value = it.calPer100
    // mark editing index
    window._editingIndex = idx
    $('#foodForm button[type=submit]').textContent = 'Запази'
    return
  }
})

document.getElementById('foodForm').addEventListener('submit', (e) => {
  e.preventDefault()
  const name = $('#name').value.trim()
  const grams = Number($('#grams').value) || 0
  const calPer100 = Number($('#calPer100').value) || 0
  if (!name || grams <= 0) return
  const items = load()
  if (typeof window._editingIndex === 'number') {
    // update existing
    items[window._editingIndex] = { name, grams, calPer100 }
    delete window._editingIndex
    $('#foodForm button[type=submit]').textContent = 'Добави'
  } else {
    items.push({ name, grams, calPer100 })
  }
  save(items)
  render()
  e.target.reset()
})

render()

// Compute metabolic split when user clicks Compute
const btnCompute = document.getElementById('btnCompute')
if (btnCompute) {
  btnCompute.addEventListener('click', (e) => {
    e.preventDefault()
    const hr = Number(document.getElementById('inputHR').value) || 75
    const activeK = Number(document.getElementById('inputActive').value) || 0
    // Use calc helper attached to window
    if (window.calc && typeof window.calc.calculateMetabolicSplit === 'function') {
      const res = window.calc.calculateMetabolicSplit({ activeCalories: activeK, currentHR: hr })
      const out = document.getElementById('metabolicOutput')
      out.textContent = `Active: ${res.activeCalories} kcal\nCarbs: ${res.carbsKcal.toFixed(0)} kcal (${res.carbsGrams.toFixed(0)} g)\nFats: ${res.fatsKcal.toFixed(0)} kcal (${res.fatsGrams.toFixed(0)} g)\nProtein: ${res.proteinKcal.toFixed(0)} kcal (${res.proteinGrams.toFixed(0)} g)\n${res.catabolicWarning?res.catabolicWarning:''}`
    } else {
      alert('calc helper not loaded')
    }
  })
}
