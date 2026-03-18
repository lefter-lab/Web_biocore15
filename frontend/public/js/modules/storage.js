import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js'
export const STORAGE_KEY = 'biocore_items'
export const MEALS_LOG_KEY = 'biocore_meals_log'
export const CHART_HISTORY_KEY = 'biocore_chart_history'
export const FOOD_LIBRARY_KEY = 'biocore_food_library'
const NIGHT_TEST_STORAGE_KEY = 'biocore_night_tests'
let localStorageEnabled = true

export function setLocalStorageEnabled(enabled = true) {
  localStorageEnabled = Boolean(enabled)
}

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

function getLocalItem(key) {
  if (!localStorageEnabled) return null
  return localStorage.getItem(key)
}

function setLocalItem(key, value) {
  if (!localStorageEnabled) return
  localStorage.setItem(key, value)
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

let cloudContext = { userId: null, db: null }
let pendingCloudPayload = {}
let cloudWriteInProgress = false
let cloudFlushTimer = null
let cloudWritesEnabled = true

function getCloudDocRef() {
  if (!cloudContext.userId || !cloudContext.db) return null
  return doc(cloudContext.db, 'users', cloudContext.userId, 'data', 'state')
}

function hasCloudContext() {
  return Boolean(cloudContext.userId && cloudContext.db)
}

function scheduleCloudFlush() {
  if (cloudFlushTimer) return
  cloudFlushTimer = setTimeout(() => {
    cloudFlushTimer = null
    void flushCloudPayload()
  }, 120)
}

async function flushCloudPayload() {
  if (cloudWriteInProgress) return
  const docRef = getCloudDocRef()
  if (!docRef || !Object.keys(pendingCloudPayload).length) return
  cloudWriteInProgress = true
  try {
    await setDoc(docRef, pendingCloudPayload, { merge: true })
    pendingCloudPayload = {}
  } catch (err) {
    console.error('Biocore: failed to flush cloud payload', err)
  } finally {
    cloudWriteInProgress = false
  }
}

function queueCloudPayload(payload) {
  if (!cloudWritesEnabled || !hasCloudContext()) return
  pendingCloudPayload = { ...pendingCloudPayload, ...payload }
  scheduleCloudFlush()
}

function ensureCloudContext(userId, db) {
  cloudContext = { userId, db }
}

export function setCloudContext(userId, db) {
  ensureCloudContext(userId, db)
}

export function clearCloudContext() {
  cloudContext = { userId: null, db: null }
  pendingCloudPayload = {}
  if (cloudFlushTimer) {
    clearTimeout(cloudFlushTimer)
    cloudFlushTimer = null
  }
}

export function setCloudWritesEnabled(enabled = true) {
  cloudWritesEnabled = enabled
}

export async function pullCloudSnapshot() {
  const docRef = getCloudDocRef()
  if (!docRef) return null
  try {
    const snapshot = await getDoc(docRef)
    return snapshot.exists() ? snapshot.data() : null
  } catch (err) {
    console.error('Biocore: failed to read cloud snapshot', err)
    return null
  }
}

export function exportLocalSnapshot() {
  return {
    biocore_items: load(),
    biocore_meals_log: loadMealsLog(),
    biocore_night_tests: loadNightTests()
  }
}

export async function pushLocalSnapshotToCloud() {
  const docRef = getCloudDocRef()
  if (!docRef) return
  try {
    const payload = exportLocalSnapshot()
    await setDoc(docRef, payload, { merge: true })
  } catch (err) {
    console.error('Biocore: failed to push local snapshot', err)
  }
}

export async function applyRemoteSnapshot(snapshot) {
  if (!snapshot) return
  const { biocore_items, biocore_meals_log, biocore_night_tests } = snapshot
  setCloudWritesEnabled(false)
  try {
    if (Array.isArray(biocore_items)) {
      save(biocore_items)
    }
    if (Array.isArray(biocore_meals_log)) {
      saveMealsLog(biocore_meals_log)
    }
    if (Array.isArray(biocore_night_tests)) {
      saveNightTests(biocore_night_tests)
    }
  } finally {
    setCloudWritesEnabled(true)
  }
}

export function loadNightTests() {
  return safeParseJson(getLocalItem(NIGHT_TEST_STORAGE_KEY), [])
}

export function saveNightTests(entries) {
  setLocalItem(NIGHT_TEST_STORAGE_KEY, JSON.stringify(entries))
  queueCloudPayload({ biocore_night_tests: entries })
}

export function load() {
  return safeParseJson(getLocalItem(STORAGE_KEY), [])
}

export function save(items) {
  setLocalItem(STORAGE_KEY, JSON.stringify(items))
  queueCloudPayload({ biocore_items: items })
}

export function normalizeFineMeal(source = {}) {
  const now = Date.now()
  const name = source.name || source.foodName || 'meal'
  const grams = parseFloat(source.grams) || 0
  const calPer100 = parseFloat(source.calPer100) || 0
  const timestamp = Number(source.timestamp) || now
  const fastCarbs = parseFloat(source.fastCarbs) || 0
  const slowCarbs = parseFloat(source.slowCarbs) || 0
  const proteins = parseFloat(source.proteins) || 0
  const fats = parseFloat(source.fats) || 0
  const kcal = Number(source.kcal) || ((grams * calPer100) / 100)
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
  const raw = getLocalItem(MEALS_LOG_KEY)
  const base = raw ? safeParseJson(raw, []) : load()
  return base.map((item) => normalizeFineMeal(item))
}

export function saveMealsLog(meals) {
  setLocalItem(MEALS_LOG_KEY, JSON.stringify(meals))
  queueCloudPayload({ biocore_meals_log: meals })
}

export function loadFoodLibrary() {
  const raw = safeParseJson(getLocalItem(FOOD_LIBRARY_KEY), [])
  return raw
    .map((entry) => normalizeLibraryEntry(entry))
    .filter(Boolean)
}

export function saveFoodLibrary(items) {
  setLocalItem(FOOD_LIBRARY_KEY, JSON.stringify(items))
  queueCloudPayload({ biocore_items: items })
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
