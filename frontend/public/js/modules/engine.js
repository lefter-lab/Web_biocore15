import { loadMealsLog, saveMealsLog } from './storage.js'
import { Calc } from '../calc.js'

export const chartHistory = { labels: [], glycogen: [], influx: [] }
export let lastBurnRate = 0
export let lastInfluxRate = 0
let latestLoopData = null

const FAT_BURN_STORAGE_KEY = 'biocore_fat_burned_today'
const PROTEIN_THRESHOLD = 0.15
const GLYCOGEN_LIMIT_GRAMS = 480
const GLYCOGEN_KCAL_PER_GRAM = 4
const CARDIO_KCAL_PER_MIN = 8
const TARGET_PROTEIN_SURPLUS = 5

const BMR_SLOT_DURATION_MIN = 10
const BMR_TOTAL_SLOTS = 144
const BMR_SLOT_KEY = 'biocore_bmr_slot_index'
const BMR_DAY_KEY = 'biocore_bmr_day'
const BMR_PASSIVE_KEY = 'biocore_passive_kcal'
const BMR_SEGMENTS = [
  { endSlot: 53, percent: 0.2, slots: 54, name: 'Sleep' },
  { endSlot: 107, percent: 0.45, slots: 54, name: 'Day' },
  { endSlot: 143, percent: 0.35, slots: 36, name: 'Recovery' }
]

const HR_KEY = 'biocore_hr'
export const HR_MANUAL_TIMESTAMP_KEY = 'biocore_hr_manual_ts'
export const HR_DECAY_BASELINE_KEY = 'biocore_hr_decay_base'
export const HR_ALERT_START_KEY = 'biocore_hr_alert_start'
const HR_DECAY_THRESHOLD = 100
const HR_DECAY_DELAY_MS = 20 * 60 * 1000
const HR_DECAY_INTERVAL_MS = 10 * 60 * 1000
const HR_DECAY_STEP = 5
const HR_AUTO_MIN = 75
export const HR_BASELINE = 65

function getDayKey(date = new Date()) {
  return date.toISOString().split('T')[0]
}

function getSlotIndex(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes()
  return Math.min(BMR_TOTAL_SLOTS - 1, Math.floor(minutes / BMR_SLOT_DURATION_MIN))
}

function getSegmentForSlot(slotIndex) {
  return BMR_SEGMENTS.find((segment) => slotIndex <= segment.endSlot)
}

export function getMetabolicPhaseInfo(timestamp = Date.now()) {
  const slot = getSlotIndex(new Date(timestamp))
  const segment = getSegmentForSlot(slot)
  return {
    slot,
    name: segment?.name || 'Metabolic',
    percent: segment?.percent || 0
  }
}

export function resetBmrTracking(dayKey) {
  const day = dayKey || getDayKey()
  localStorage.setItem(BMR_DAY_KEY, day)
  localStorage.setItem(BMR_SLOT_KEY, '-1')
  localStorage.setItem(BMR_PASSIVE_KEY, '0')
}

function accumulatePassiveBmr(bmr, nowMs) {
  if (!bmr) {
    return Number(localStorage.getItem(BMR_PASSIVE_KEY) || 0)
  }
  const day = getDayKey(new Date(nowMs))
  const storedDay = localStorage.getItem(BMR_DAY_KEY)
  if (storedDay !== day) {
    resetBmrTracking(day)
  }
  const currentSlot = getSlotIndex(new Date(nowMs))
  const storedSlot = Number(localStorage.getItem(BMR_SLOT_KEY) ?? -1)
  let updatedPassive = Number(localStorage.getItem(BMR_PASSIVE_KEY) || 0)
  if (currentSlot <= storedSlot) {
    return updatedPassive
  }
  for (let slot = Math.max(storedSlot + 1, 0); slot <= currentSlot; slot += 1) {
    const segment = getSegmentForSlot(slot)
    if (!segment) continue
    updatedPassive += (segment.percent * bmr) / segment.slots
  }
  localStorage.setItem(BMR_PASSIVE_KEY, updatedPassive.toFixed(2))
  localStorage.setItem(BMR_SLOT_KEY, String(currentSlot))
  return Number(updatedPassive.toFixed(2))
}

function getEffectiveHr(nowMs) {
  let storedHr = Math.max(HR_BASELINE, Number(localStorage.getItem(HR_KEY) || HR_BASELINE))
  const manualTs = Number(localStorage.getItem(HR_MANUAL_TIMESTAMP_KEY) || 0)
  const decayBase = Number(localStorage.getItem(HR_DECAY_BASELINE_KEY) || storedHr)
  if (storedHr > HR_DECAY_THRESHOLD && manualTs > 0) {
    const decayStart = manualTs + HR_DECAY_DELAY_MS
    if (nowMs >= decayStart) {
      const elapsed = nowMs - decayStart
      const steps = Math.floor(elapsed / HR_DECAY_INTERVAL_MS) + 1
      const target = Math.max(decayBase - steps * HR_DECAY_STEP, HR_AUTO_MIN)
      if (target < storedHr) {
        storedHr = target
        localStorage.setItem(HR_KEY, String(storedHr))
      }
    }
  }
  return storedHr
}

export function resetHrToBaseline() {
  localStorage.setItem(HR_KEY, String(HR_BASELINE))
  localStorage.removeItem(HR_MANUAL_TIMESTAMP_KEY)
  localStorage.removeItem(HR_DECAY_BASELINE_KEY)
  localStorage.removeItem(HR_ALERT_START_KEY)
}

export function absorbMealsForInterval(meals, nowMs, intervalMinutes) {
  if (!Calc || typeof Calc.absorbMealsForInterval !== 'function') {
    return {
      absorbedGrams: { carbs: 0, protein: 0, fats: 0 },
      influxRateGPerMin: { carbs: 0, protein: 0, fats: 0 }
    }
  }
  return Calc.absorbMealsForInterval(meals, nowMs, intervalMinutes)
}

export function pushMetabolicHistory(label, glycogenValue, influxValue, maxPoints) {
  chartHistory.labels.push(label)
  chartHistory.glycogen.push(glycogenValue)
  chartHistory.influx.push(influxValue)
  if (chartHistory.labels.length > maxPoints) {
    chartHistory.labels.shift()
    chartHistory.glycogen.shift()
    chartHistory.influx.shift()
  }
}

function getCarbsPct(hr) {
  if (hr > 150) return 0.9
  if (hr > 120) return 0.7
  if (hr < 75) return 0.3
  return 0.5
}

function calculateMacroBurn(kcal, carbsPct, fatsPct) {
  const proteinPct = PROTEIN_THRESHOLD
  const totalPct = carbsPct + fatsPct + proteinPct
  const normalized = totalPct > 0 ? 1 / totalPct : 0
  const effectiveCarbsPct = carbsPct * normalized
  const effectiveFatsPct = fatsPct * normalized
  const effectiveProteinPct = proteinPct * normalized
  return {
    carbs: (kcal * effectiveCarbsPct) / 4,
    fats: (kcal * effectiveFatsPct) / 9,
    protein: (kcal * effectiveProteinPct) / 4
  }
}

export function metabolicLoop(modeOverride) {
  const meals = loadMealsLog()
  const now = Date.now()
  const intervalMinutes = 5
  const delayMs = Calc?.CONFIG?.DIGESTIVE_DELAY_MINS ? Calc.CONFIG.DIGESTIVE_DELAY_MINS * 60000 : 0
  const digestingMeals = meals.filter((meal) => {
    const ts = Number(meal.timestamp) || 0
    return ts > 0 && now - ts < delayMs
  })
  const result = absorbMealsForInterval(meals, now, intervalMinutes)
  saveMealsLog(meals)
  const remainingCarbs = meals.reduce((sum, meal) => {
    return sum + (meal.remainingFast || 0) + (meal.remainingSlow || 0)
  }, 0)
  const totalProteinIn = meals.reduce((sum, meal) => sum + (Number(meal.proteins) || 0), 0)

  const glycKey = 'biocore_glycogen'
  const fatKey = 'biocore_fat_from_carbs'
  let glycogen = Number(localStorage.getItem(glycKey) || 0)
  let fatFromCarbs = Number(localStorage.getItem(fatKey) || 0)
  const absorbedCarbs = result.absorbedGrams.carbs || 0
  const spill = (Calc && typeof Calc.calculateGlycogenUpdate === 'function')
    ? Calc.calculateGlycogenUpdate(glycogen, absorbedCarbs)
    : { newGlycogen: glycogen + absorbedCarbs, addedToFat: 0 }
  glycogen = spill.newGlycogen
  fatFromCarbs += spill.addedToFat
  localStorage.setItem(glycKey, glycogen)
  localStorage.setItem(fatKey, fatFromCarbs)

  const hr = getEffectiveHr(now)
  const weight = Number(localStorage.getItem('biocore_weight') || 70)
  const height = Number(localStorage.getItem('biocore_height') || 170)
  const age = Number(localStorage.getItem('biocore_age') || 30)
  const gender = localStorage.getItem('biocore_gender') || 'male'
  const activeKcalDay = Number(localStorage.getItem('biocore_active_kcal') || 0)
  const bmr = (Calc && typeof Calc.calculateBMR === 'function')
    ? Calc.calculateBMR(weight, height, age, gender)
    : 0
  const mode = modeOverride || localStorage.getItem('biocore_mode') || 'Maintenance'
  const passiveBmrToday = accumulatePassiveBmr(bmr, now)
  const burnGPerMin = (Calc && typeof Calc.calculateMinuteBurn === 'function')
    ? Calc.calculateMinuteBurn(hr, bmr, activeKcalDay, mode)
    : 0
  lastBurnRate = burnGPerMin
  lastInfluxRate = Number(result.influxRateGPerMin.carbs || 0)
  const hasDigesting = digestingMeals.length > 0
  const status = hasDigesting
    ? 'Digesting'
    : (result.influxRateGPerMin.carbs > burnGPerMin ? 'STORING ENERGY' : 'BURNING FAT')

  const carbsPct = getCarbsPct(hr)
  const fatsPct = Math.max(0, 1 - carbsPct - PROTEIN_THRESHOLD)
  const restingBurn = calculateMacroBurn(bmr, carbsPct, fatsPct)
  const activeBurn = calculateMacroBurn(activeKcalDay, carbsPct, fatsPct)
  const totalBurn = calculateMacroBurn(bmr + activeKcalDay, carbsPct, fatsPct)
  const burnSummary = { resting: restingBurn, active: activeBurn, total: totalBurn }
  const fatBurnGrams = Math.max(0, burnSummary.total?.fats || 0)
  localStorage.setItem(FAT_BURN_STORAGE_KEY, fatBurnGrams.toFixed(2))

  const state = {
    mode,
    result,
    glycogen,
    fatFromCarbs,
    hr,
    weight,
    height,
    age,
    gender,
    activeKcalDay,
    bmr,
    passiveBmrToday,
    burnGPerMin,
    absorbedCarbs,
    digestingMeals,
    remainingCarbs,
    timestamp: now,
    status,
    lastBurnRate,
    lastInfluxRate,
    burnSummary,
    fatBurnToday: fatBurnGrams,
    totalProteinIn
  }
  latestLoopData = state
  return state
}

export function getMetabolicAdvice() {
  if (!latestLoopData) {
    return { text: 'System is calibrating, please wait...', level: 'info' }
  }
  const { glycogen, mode, burnSummary = {}, totalProteinIn = 0 } = latestLoopData
  const proteinBurned = burnSummary.total?.protein || 0
  const proteinSurplus = Math.max(0, totalProteinIn - proteinBurned)
  const netChange = Number(lastInfluxRate || 0) - Number(lastBurnRate || 0)
  if (glycogen > GLYCOGEN_LIMIT_GRAMS) {
    const excessGrams = glycogen - GLYCOGEN_LIMIT_GRAMS
    const excessCalories = Math.round(excessGrams * GLYCOGEN_KCAL_PER_GRAM)
    const cardioMinutes = Math.max(1, Math.ceil(excessCalories / CARDIO_KCAL_PER_MIN))
    return {
      text: `Do ${cardioMinutes} min. of cardio to burn the excess ${excessCalories} kcal.`,
      level: 'warn'
    }
  }
  if (mode === 'Muscle Build' && proteinSurplus < TARGET_PROTEIN_SURPLUS) {
    const proteinTarget = Math.max(1, Math.ceil(TARGET_PROTEIN_SURPLUS - proteinSurplus))
    return {
      text: `Eat ${proteinTarget}g of protein to protect your muscles.`,
      level: 'warn'
    }
  }
  if (mode === 'Fat Burn' && netChange > 0) {
    const blockedMinutes = Math.min(35, Math.max(5, Math.round(netChange * 6)))
    return {
      text: `Insulin is high. Fat burning is blocked for another ${blockedMinutes} minutes.`,
      level: 'warn'
    }
  }
  return { text: 'Metabolism is stable. Keep following the plan.', level: 'info' }
}
