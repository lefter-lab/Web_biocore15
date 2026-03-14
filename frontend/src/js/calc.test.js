describe('BioCore Calculation Module (basic checks)', () => {
  test('calculateBMR should return correct value for a male', () => {
    const weight = 80
    const height = 180
    const age = 30
    const result = bmr(weight, height, age)

    expect(result).toBe(1780)
  })

  test('calculateMetabolicSplit should flag catabolism when HR is too high', () => {
    // High HR and sustained activity to trigger catabolic warning
    const split = calculateMetabolicSplit({ currentHR: 185, activeCalories: 400, durationMins: 60 })

    expect(split.catabolicWarning).not.toBeNull()
    // carbsKcal should be ~80% of activeCalories in high-HR zone
    expect(split.carbsKcal / split.activeCalories).toBeCloseTo(0.8, 3)
  })
})
import { bmr, reqCPerHour, absorptionRates, calculateMetabolicSplit, mealKcal } from './calc.js'

test('bmr calculation example', () => {
  expect(bmr(80,180,30)).toBeCloseTo(10*80+6.25*180-5*30+5)
})

test('reqCPerHour matches formula', () => {
  const b = bmr(80,180,30)
  expect(reqCPerHour(b)).toBeCloseTo((b*0.30)/4/24)
})

test('absorptionRates returns zeros for old meal', () => {
  const old = { timestamp: Date.now() - 25*3600*1000, fastCarbs: 50, slowCarbs: 0, proteins:0, fats:0 }
  const r = absorptionRates(old, Date.now())
  expect(r.c).toBe(0)
})

test('calculateMetabolicSplit HR zones produce expected dominant macros', () => {
  const low = calculateMetabolicSplit({ activeCalories: 300, currentHR: 80 })
  expect(low.fatsKcal).toBeGreaterThan(low.carbsKcal)

  const high = calculateMetabolicSplit({ activeCalories: 300, currentHR: 150 })
  expect(high.carbsKcal).toBeGreaterThan(high.fatsKcal)
})

test('mealKcal basic', () => {
  const m = { fastCarbs: 10, slowCarbs: 5, proteins: 2, fats: 1 }
  expect(mealKcal(m)).toBe((10+5)*4 + 2*4 + 1*9)
})
