import { loadMealsLog, saveMealsLog } from './storage.js'
import { Calc } from '../calc.js'

export const chartHistory = { labels: [], glycogen: [], influx: [] }
export let lastBurnRate = 0
export let lastInfluxRate = 0

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

export function metabolicLoop(modeOverride) {
  const meals = loadMealsLog()
  const now = Date.now()
  const intervalMinutes = 5
  const result = absorbMealsForInterval(meals, now, intervalMinutes)
  saveMealsLog(meals)

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

  const hr = Number(localStorage.getItem('biocore_hr') || 70)
  const weight = Number(localStorage.getItem('biocore_weight') || 70)
  const height = Number(localStorage.getItem('biocore_height') || 170)
  const age = Number(localStorage.getItem('biocore_age') || 30)
  const gender = localStorage.getItem('biocore_gender') || 'male'
  const activeKcalDay = Number(localStorage.getItem('biocore_active_kcal') || 0)
  const bmr = (Calc && typeof Calc.calculateBMR === 'function')
    ? Calc.calculateBMR(weight, height, age, gender)
    : 0
  const mode = modeOverride || localStorage.getItem('biocore_mode') || 'Maintenance'
  const burnGPerMin = (Calc && typeof Calc.calculateMinuteBurn === 'function')
    ? Calc.calculateMinuteBurn(hr, bmr, activeKcalDay, mode)
    : 0
  lastBurnRate = burnGPerMin
  lastInfluxRate = Number(result.influxRateGPerMin.carbs || 0)

  return {
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
    burnGPerMin,
    absorbedCarbs,
    timestamp: now,
    status: result.influxRateGPerMin.carbs > burnGPerMin ? 'STORING ENERGY' : 'BURNING FAT',
    lastBurnRate,
    lastInfluxRate
  }
}
