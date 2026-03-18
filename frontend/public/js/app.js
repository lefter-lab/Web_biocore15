import { Calc } from './calc.js'
import { metabolicLoop } from './modules/engine.js'
import { load, setLocalStorageEnabled } from './modules/storage.js'
import {
  render,
  renderFineLog,
  updateStepDisplay,
  initMetabolicChart,
  startFineNutritionTicker,
  restoreChartHistory,
  saveChartHistory,
  updateTimes
} from './modules/ui_render.js'
import {
  attachHandlers,
  renderFoodLibraryOptions,
  rerenderMeals,
  resetStepsAtMidnight,
  refreshMetabolicStatus,
  initMetabolicMode,
  startMetabolicTicker,
  updateNightTestPanel
} from './modules/handlers.js'
import {
  initFirebaseAuth,
  handleGoogleLogin,
  handleEmailAuth,
  handleEmailSignup,
  handleSignOut,
  setLockedState
} from './modules/auth.js'

const CHART_HISTORY_SAVE_INTERVAL_MS = 60000
const MIDNIGHT_CHECK_INTERVAL_MS = 60 * 60 * 1000
const signupTrigger = document.getElementById('signupTrigger')
const emailSignupForm = document.getElementById('emailSignupForm')

function initApp() {
  setLockedState(true)
  setLocalStorageEnabled(false)
  if (signupTrigger) {
    signupTrigger.setAttribute('aria-expanded', 'false')
    signupTrigger.setAttribute('aria-controls', 'emailSignupForm')
  }
  resetStepsAtMidnight()
  setInterval(resetStepsAtMidnight, MIDNIGHT_CHECK_INTERVAL_MS)
  renderFoodLibraryOptions()
  restoreChartHistory()
  attachHandlers({
    handleGoogleLogin,
    handleEmailAuth,
    handleEmailSignup,
    handleSignOut
  })
  initFirebaseAuth()
  initMetabolicChart()
  initMetabolicMode()
  rerenderMeals()
  renderFineLog()
  updateNightTestPanel()
  startFineNutritionTicker()
  refreshMetabolicStatus()
  startMetabolicTicker()
  updateTimes()
  updateStepDisplay()
  setInterval(saveChartHistory, CHART_HISTORY_SAVE_INTERVAL_MS)
  setInterval(updateTimes, 60000)
}

window.Calc = Calc
window.load = load
window.render = render
window.metabolicLoop = metabolicLoop
window.renderFineLog = renderFineLog

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp)
} else {
  initApp()
}
