// Simple global calc helper (port of EnergyTrackingModule.calculateMetabolicSplit)
(function(global){
  function calculateMetabolicSplit(opts){
    opts = opts || {}
    const totalCalories = opts.totalCalories||0
    const activeCalories = opts.activeCalories||0
    const basalCalories = opts.basalCalories||0
    const currentHR = opts.currentHR||75
    const durationMins = opts.durationMins||0

    const CARB_KCAL = 4.0
    const PROTEIN_KCAL = 4.0
    const FAT_KCAL = 9.0

    let carbsPct, fatsPct, proteinPct
    if (currentHR < 100) {
      fatsPct = 0.65; carbsPct = 0.30; proteinPct = 0.05
    } else if (currentHR >= 100 && currentHR <= 140){
      fatsPct = 0.40; carbsPct = 0.55; proteinPct = 0.05
    } else {
      fatsPct = 0.10; carbsPct = 0.80; proteinPct = 0.10
    }

    const carbsKcal = activeCalories * carbsPct
    const fatsKcal = activeCalories * fatsPct
    const proteinKcal = activeCalories * proteinPct

    const carbsGrams = carbsKcal / CARB_KCAL
    const fatsGrams = fatsKcal / FAT_KCAL
    const proteinGrams = proteinKcal / PROTEIN_KCAL

    const PROTEIN_THRESHOLD = 0.15
    const DURATION_THRESHOLD_MINS = 45
    let catabolicWarning = null
    if (proteinKcal > PROTEIN_THRESHOLD * 200 && durationMins > DURATION_THRESHOLD_MINS) {
      catabolicWarning = '⚠️ High protein burn detected. Risk of muscle breakdown.'
    } else if (proteinKcal > PROTEIN_THRESHOLD * 250) {
      catabolicWarning = '⚠️ Very high catabolic state. Increase carbs or protein intake.'
    }

    return {
      totalCalories, activeCalories, basalCalories,
      carbsKcal, carbsGrams, fatsKcal, fatsGrams, proteinKcal, proteinGrams, catabolicWarning
    }
  }

  global.calc = global.calc || {}
  global.calc.calculateMetabolicSplit = calculateMetabolicSplit
})(window);
