export const Calc = {
  CONFIG: {
    MAX_GLYCOGEN: 500.0,
    FAT_CONVERSION_EFFICIENCY: 0.25,
    DIGESTIVE_DELAY_MINS: 15,
    ABSORPTION_RATES: {
      fastCarbs: 1.0,   // g/min
      slowCarbs: 0.33,  // g/min
      proteins: 0.25,
      fats: 0.08
    }
  },
  calculateBMR,
  calculateMinuteBurn,
  calculateGlycogenUpdate,
  absorbFromMeal,
  absorbMealsForInterval
}

function calculateBMR(weight, height, age, gender) {
  let bmr = (10 * weight) + (6.25 * height) - (5 * age)
  return gender === 'male' ? bmr + 5 : bmr - 161
}

function calculateMinuteBurn(hr, bmr, activeKcalDay, mode = 'Maintenance') {
  const totalKcalMin = (bmr + (activeKcalDay || 0)) / 1440
  let carbsPct = 0.5
  if (hr > 150) carbsPct = 0.9
  else if (hr > 120) carbsPct = 0.7
  else if (hr < 75) carbsPct = 0.3

  const modeAdjust = {
    'Fat Burn': -0.15,
    'Muscle Build': 0.10,
    'Maintenance': 0.0,
    'Brain Power': 0.12,
    'Deep Recovery': -0.05
  }
  const adj = modeAdjust[mode] || 0
  carbsPct = Math.max(0, Math.min(1, carbsPct + adj))

  return (totalKcalMin * carbsPct) / 4
}

function calculateGlycogenUpdate(currentGlycogen, absorbedGrams) {
  const config = Calc.CONFIG
  let newG = currentGlycogen + absorbedGrams
  let addedToFat = 0
  if (newG > config.MAX_GLYCOGEN) {
    const overflow = newG - config.MAX_GLYCOGEN
    newG = config.MAX_GLYCOGEN
    addedToFat = overflow * config.FAT_CONVERSION_EFFICIENCY
  }
  return { newGlycogen: Math.max(0, newG), addedToFat }
}

function absorbFromMeal(meal, nowMs, intervalSeconds) {
  const config = Calc.CONFIG
  const delayMs = config.DIGESTIVE_DELAY_MINS * 60000
  if (!meal.timestamp) return { carbs: 0, protein: 0, fats: 0 }
  const startMs = meal.timestamp + delayMs
  if (nowMs < startMs) return { carbs: 0, protein: 0, fats: 0 }
  const sec = Math.max(1, intervalSeconds)
  meal.remainingFast = Number.isFinite(meal.remainingFast) ? meal.remainingFast : (Number(meal.fastCarbs) || 0)
  meal.remainingSlow = Number.isFinite(meal.remainingSlow) ? meal.remainingSlow : (Number(meal.slowCarbs) || 0)
  meal.remainingProt = Number.isFinite(meal.remainingProt) ? meal.remainingProt : (Number(meal.proteins) || 0)
  meal.remainingFat = Number.isFinite(meal.remainingFat) ? meal.remainingFat : (Number(meal.fats) || 0)

  let absorbedFast = 0, absorbedSlow = 0, absorbedProt = 0, absorbedFat = 0

  if (meal.remainingFast > 0) {
    const canAbsorb = config.ABSORPTION_RATES.fastCarbs * (sec / 60)
    const take = Math.min(meal.remainingFast, canAbsorb)
    meal.remainingFast -= take
    absorbedFast = take
  }
  if (meal.remainingSlow > 0) {
    const canAbsorb = config.ABSORPTION_RATES.slowCarbs * (sec / 60)
    const take = Math.min(meal.remainingSlow, canAbsorb)
    meal.remainingSlow -= take
    absorbedSlow = take
  }
  if (meal.remainingProt > 0) {
    const canAbsorb = config.ABSORPTION_RATES.proteins * (sec / 60)
    const take = Math.min(meal.remainingProt, canAbsorb)
    meal.remainingProt -= take
    absorbedProt = take
  }
  if (meal.remainingFat > 0) {
    const canAbsorb = config.ABSORPTION_RATES.fats * (sec / 60)
    const take = Math.min(meal.remainingFat, canAbsorb)
    meal.remainingFat -= take
    absorbedFat = take
  }

  return {
    carbs: absorbedFast + absorbedSlow,
    protein: absorbedProt,
    fats: absorbedFat
  }
}

function absorbMealsForInterval(meals, nowMs, intervalSeconds) {
  let totalCarbs = 0, totalProtein = 0, totalFats = 0
  meals.forEach((meal) => {
    const absorbed = absorbFromMeal(meal, nowMs, intervalSeconds)
    totalCarbs += absorbed.carbs
    totalProtein += absorbed.protein
    totalFats += absorbed.fats
  })
  const perMinFactor = 60 / Math.max(1, intervalSeconds)
  return {
    absorbedGrams: { carbs: totalCarbs, protein: totalProtein, fats: totalFats },
    influxRateGPerMin: {
      carbs: totalCarbs * perMinFactor,
      protein: totalProtein * perMinFactor,
      fats: totalFats * perMinFactor
    }
  }
}
