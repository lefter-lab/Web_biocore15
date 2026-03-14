// Calc module ported from Android MainActivity (read-only extraction)
// Exports core functions used by the frontend UI.

export function bmr(weightKg, heightCm, ageYears) {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5
}

export function reqCPerHour(bmrValue) {
  return (bmrValue * 0.30) / 4.0 / 24.0
}

// Given a meal object {timestamp, fastCarbs, slowCarbs, proteins, fats}
// and current time `now` (ms), compute current per-hour absorption rates (g/h)
export function absorptionRates(meal, now) {
  const hoursSince = (now - meal.timestamp) / 3600000.0
  if (hoursSince > 24) return { c: 0, p: 0, f: 0 }

  const fastRate = (meal.fastCarbs > 0 && hoursSince >= 0.25 && hoursSince <= (meal.fastCarbs / 60.0 + 0.25)) ? 60.0 : 0.0
  const slowRate = (meal.slowCarbs > 0 && hoursSince >= 0.25 && hoursSince <= (meal.slowCarbs / 20.0 + 0.25)) ? 20.0 : 0.0
  const pRate = (meal.proteins > 0 && hoursSince >= 0.25 && hoursSince <= (meal.proteins / 15.0 + 0.25)) ? 15.0 : 0.0
  const fRate = (meal.fats > 0 && hoursSince >= 0.25 && hoursSince <= (meal.fats / 5.0 + 0.25)) ? 5.0 : 0.0

  return { c: fastRate + slowRate, p: pRate, f: fRate }
}

// Compute total blood rates from a list of meals
export function totalBloodRates(meals, now) {
  let totalC = 0, totalP = 0, totalF = 0
  for (const m of meals) {
    const r = absorptionRates(m, now)
    totalC += r.c
    totalP += r.p
    totalF += r.f
  }
  return { c: totalC, p: totalP, f: totalF }
}

// Update glycogen based on blood carb rate and hoursPassed
export function updateGlycogen(state, hoursPassed, bmrValue) {
  // state: { glycogenLevel, fatStorageFromCarbs }
  const reqC = reqCPerHour(bmrValue)
  const netHourlyCarbs = state.totalBloodC - reqC
  if (netHourlyCarbs > 0) {
    const spaceLeft = 500.0 - state.glycogenLevel
    const energyIn = netHourlyCarbs * hoursPassed * 0.85
    if (energyIn <= spaceLeft) {
      state.glycogenLevel += energyIn
    } else {
      state.glycogenLevel = 500.0
      state.fatStorageFromCarbs = (state.fatStorageFromCarbs || 0) + (energyIn - spaceLeft) * 0.25
    }
  } else {
    state.glycogenLevel = Math.max(0, state.glycogenLevel + netHourlyCarbs * hoursPassed)
  }
  return state
}

export function mealKcal(meal) {
  return (meal.fastCarbs + meal.slowCarbs) * 4 + meal.proteins * 4 + meal.fats * 9
}

export function totalInKcal(meals) {
  return meals.reduce((s, m) => s + mealKcal(m), 0)
}

// Port of EnergyTrackingModule.calculateMetabolicSplit from Android
// Inputs: totalCalories, activeCalories, basalCalories, currentHR, durationMins
// Returns object with carbsKcal, fatsKcal, proteinKcal and grams
export function calculateMetabolicSplit({ totalCalories = 0, activeCalories = 0, basalCalories = 0, currentHR = 75, durationMins = 0 } = {}) {
  const CARB_KCAL = 4.0
  const PROTEIN_KCAL = 4.0
  const FAT_KCAL = 9.0

  let carbsPct, fatsPct, proteinPct

  if (currentHR < 100) {
    fatsPct = 0.65
    carbsPct = 0.30
    proteinPct = 0.05
  } else if (currentHR >= 100 && currentHR <= 140) {
    fatsPct = 0.40
    carbsPct = 0.55
    proteinPct = 0.05
  } else {
    fatsPct = 0.10
    carbsPct = 0.80
    proteinPct = 0.10
  }

  const carbsKcal = activeCalories * carbsPct
  const fatsKcal = activeCalories * fatsPct
  const proteinKcal = activeCalories * proteinPct

  const carbsGrams = carbsKcal / CARB_KCAL
  const fatsGrams = fatsKcal / FAT_KCAL
  const proteinGrams = proteinKcal / PROTEIN_KCAL

  // Catabolism warnings (simple port)
  const PROTEIN_THRESHOLD = 0.15
  const DURATION_THRESHOLD_MINS = 45
  let catabolicWarning = null
  if (proteinKcal > PROTEIN_THRESHOLD * 200 && durationMins > DURATION_THRESHOLD_MINS) {
    catabolicWarning = '⚠️ High protein burn detected. Risk of muscle breakdown.'
  } else if (proteinKcal > PROTEIN_THRESHOLD * 250) {
    catabolicWarning = '⚠️ Very high catabolic state. Increase carbs or protein intake.'
  }

  return {
    totalCalories,
    activeCalories,
    basalCalories,
    carbsKcal,
    carbsGrams,
    fatsKcal,
    fatsGrams,
    proteinKcal,
    proteinGrams,
    catabolicWarning
  }
}

// Backwards-compatible alias: some tests/use-cases expect `calculateBMR`
export { bmr as calculateBMR }

// Project tree (kept for reference)
// /my-calorie-tracker
// |-- /public
// |   |-- index.html
// |   |-- styles.css
// |   |-- script.js
// |-- /server (if using a backend)
// |   |-- server.kt (or server.js for Node.js)
// |-- /data (if using a local database)
// |   |-- food_data.json