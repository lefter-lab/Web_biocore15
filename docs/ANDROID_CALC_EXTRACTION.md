Android -> Web: Extracted calculation logic

This document lists the core calculation formulas and behavior extracted from
`app/src/main/java/com/officer/biocore15/MainActivity.kt` for reuse in the web
frontend. Extraction is read-only: Android sources were not modified.

Key formulas and behaviors
1) BMR (Mifflin-St Jeor, male constant +5 used in Android):
   BMR = 10 * weight + 6.25 * height - 5 * age + 5

2) Basal macronutrient split used in UI (per-hour/carbs requirement):
   - Carbs: 30% of BMR kcal
   - Fats: 60% of BMR kcal
   - Protein: 10% of BMR kcal
   reqCPerHour = (BMR * 0.30) / 4 / 24  // grams/h required from carbs

3) Active metabolic split / EnergyTrackingModule
   - Android uses a helper `EnergyTrackingModule` to split active kcal into
     carbs/fats/protein kcal. For the web module we will accept the same
     inputs (activeKcal, hr, user parameters) and return kcal per macro.

4) Meal absorption kinetics (per meal, within 24h window):
   - fast carbs absorption rate: 60 g/h while hoursSince in [0.25, fastCarbs/60 + 0.25]
   - slow carbs absorption rate: 20 g/h while hoursSince in [0.25, slowCarbs/20 + 0.25]
   - protein absorption rate: 15 g/h while hoursSince in [0.25, proteins/15 + 0.25]
   - fat absorption rate: 5 g/h while hoursSince in [0.25, fats/5 + 0.25]
   - For display the Android code sums current per-hour rates into totalBloodC/P/F

5) Glycogen update logic (kinetic energy handling):
   - netHourlyCarbs = totalBloodC - reqCPerHour
   - if netHourlyCarbs > 0:
       energyIn = netHourlyCarbs * hoursPassed * 0.85
       spaceLeft = 500 - glycogenLevel
       if energyIn <= spaceLeft: glycogenLevel += energyIn
       else: glycogenLevel = 500; fatStorageFromCarbs += (energyIn - spaceLeft) * 0.25
     else:
       glycogenLevel = max(0, glycogenLevel + netHourlyCarbs * hoursPassed)

6) Kcal calculations for meals and totals:
   - meal kcal = (fastCarbs + slowCarbs) * 4 + proteins * 4 + fats * 9
   - totalInKcal = sum(meal kcal)
   - displayInKcal = max(0, totalInKcal - dailyInOffsetKcal) // offset used by app

Files referenced in Android (read-only):
- `MainActivity.kt` (lines with `loadHealthData`, `updateFineNutritionUI`, `showFoodInputDialog`)

Next steps for web port (suggested):
1) Implement a lightweight JS calc module that mirrors the functions above.
2) Add unit tests for the calc module using known inputs.
3) Integrate calc module into UI (`frontend/public/js/app.js`).

Notes
- Extraction preserved numeric constants and behavior (e.g. 500g glycogen cap,
  0.85 store factor, 0.25 fat conversion). These match Android code and can be
  adjusted later if needed.
