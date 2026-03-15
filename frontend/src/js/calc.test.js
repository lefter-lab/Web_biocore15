import { calculateBMR, calculateMinuteBurn, calculateGlycogenUpdate, CONFIG } from './calc.js'

describe('Calc module (updated API)', () => {
  test('calculateBMR (Mifflin-St Jeor) returns expected value for male', () => {
    const weight = 80
    const height = 180
    const age = 30
    const gender = 'male'
    const result = calculateBMR(weight, height, age, gender)
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(result).toBeCloseTo(1780, 6)
  })

  test('calculateMinuteBurn burns more glycogen at high HR', () => {
    const weight = 80
    const height = 180
    const age = 30
    const gender = 'male'
    const bmr = calculateBMR(weight, height, age, gender)
    const activeKcalDay = 600

    const burnLow = calculateMinuteBurn(70, bmr, activeKcalDay)
    const burnHigh = calculateMinuteBurn(160, bmr, activeKcalDay)

    expect(burnHigh).toBeGreaterThan(burnLow)
  })

  test('calculateGlycogenUpdate spills overflow to fat when exceeding MAX_GLYCOGEN', () => {
    const current = 480
    const absorbed = 50 // total becomes 530 -> overflow 30
    const res = calculateGlycogenUpdate(current, absorbed)
    expect(res.newGlycogen).toBeCloseTo(CONFIG.MAX_GLYCOGEN, 6)
    const expectedOverflow = (current + absorbed) - CONFIG.MAX_GLYCOGEN // 30
    const expectedFat = expectedOverflow * CONFIG.FAT_CONVERSION_EFFICIENCY // 30*0.25=7.5
    expect(res.addedToFat).toBeCloseTo(expectedFat, 6)
  })
})
