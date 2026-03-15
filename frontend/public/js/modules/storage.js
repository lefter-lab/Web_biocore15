export const STORAGE_KEY = 'biocore_items'
export const MEALS_LOG_KEY = 'biocore_meals_log'
export const CHART_HISTORY_KEY = 'biocore_chart_history'

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
