export const STORAGE_KEY = 'biocore_items'
export const MEALS_LOG_KEY = 'biocore_meals_log'
export const CHART_HISTORY_KEY = 'biocore_chart_history'
export const FOOD_LIBRARY_KEY = 'biocore_food_library'

export function safeParseJson(value, fallback = []) {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch (err) {
    console.warn('Biocore: failed to parse JSON', err)
    return fallback
  }
}

function normalizeLibraryEntry(source = {}) {
  if (!source) return null
  const name = (source.name || source.foodName || '').toString().trim()
  if (!name) return null
  const fastCarbs = Number(source.fastCarbs) || 0
  const slowCarbs = Number(source.slowCarbs) || 0
  const proteins = Number(source.proteins) || 0
  const fats = Number(source.fats) || 0
  const calPer100 = Number(source.calPer100 ?? source.calories) || 0
  return { name, fastCarbs, slowCarbs, proteins, fats, calPer100 }
}

function normalizeSearchString(value) {
  return (value || '').toString().trim().toLowerCase().replace(/\s+/g, ' ')
}

function entriesShareSubstring(target, candidate, minLength = 3) {
  if (!target || !candidate) return false
  const maxLen = Math.min(4, target.length, candidate.length)
  for (let chunkLength = maxLen; chunkLength >= minLength; chunkLength--) {
    for (let i = 0; i + chunkLength <= target.length; i++) {
      const fragment = target.slice(i, i + chunkLength)
      if (candidate.includes(fragment)) {
        return true
      }
    }
  }
  return false
}

function fuzzyMatchStrings(target, candidate) {
  if (!target || !candidate) return false
  if (candidate === target) return true
  if (candidate.includes(target) || target.includes(candidate)) return true
  return entriesShareSubstring(target, candidate) || entriesShareSubstring(candidate, target)
}

/*
Firebase integration sketch
const firebaseConfig = { apiKey: '', authDomain: '', projectId: '' }
function initFirebaseAuth() {
  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = getFirestore(app)
  // wire auth state to biocore_user_id and logins
}
function syncMeals(userId, payload) {
  if (!userId) return
  // push payload to Firestore collection biocore_meals/{userId}
}
*/

export function load() {
  return safeParseJson(localStorage.getItem(STORAGE_KEY), [])
}

export function save(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function normalizeFineMeal(source = {}) {
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

export function loadMealsLog() {
  const raw = localStorage.getItem(MEALS_LOG_KEY)
  const base = raw ? safeParseJson(raw, []) : load()
  return base.map((item) => normalizeFineMeal(item))
}

export function saveMealsLog(meals) {
  localStorage.setItem(MEALS_LOG_KEY, JSON.stringify(meals))
}

export function loadFoodLibrary() {
  const raw = safeParseJson(localStorage.getItem(FOOD_LIBRARY_KEY), [])
  return raw
    .map((entry) => normalizeLibraryEntry(entry))
    .filter(Boolean)
}

export function saveFoodLibrary(items) {
  localStorage.setItem(FOOD_LIBRARY_KEY, JSON.stringify(items))
}

export function addFoodToLibrary(entry) {
  const normalized = normalizeLibraryEntry(entry)
  if (!normalized) return
  const existing = loadFoodLibrary()
  const dup = existing.some((item) => item.name.toLowerCase() === normalized.name.toLowerCase())
  if (dup) return
  const updated = [...existing, normalized]
  saveFoodLibrary(updated)
}

export function deleteFoodFromLibrary(name) {
  const target = (name || '').toString().trim().toLowerCase()
  if (!target) return
  const filtered = loadFoodLibrary().filter((entry) => entry.name.toLowerCase() !== target)
  saveFoodLibrary(filtered)
}

export function findFoodInLibrary(name) {
  const target = normalizeSearchString(name)
  if (!target) return null
  const entries = loadFoodLibrary()
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    _search: normalizeSearchString(entry.name)
  }))
  const exact = normalizedEntries.find((entry) => entry._search === target)
  if (exact) return exact
  const inclusive = normalizedEntries.find((entry) => entry._search.includes(target) || target.includes(entry._search))
  if (inclusive) return inclusive
  const fuzzy = normalizedEntries.find((entry) => fuzzyMatchStrings(target, entry._search))
  return fuzzy || null
}
