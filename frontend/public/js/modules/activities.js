import { collection, addDoc, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js'
import { getCloudContext } from './storage.js'

// Activity configuration
const ACTIVITY_CONFIG = {
  cardio: {
    name: 'Cardio',
    activities: [
      { name: 'Jogging', baseCalories: { low: 7, medium: 10, high: 13 } },
      { name: 'Swimming', baseCalories: { low: 8, medium: 11, high: 14 } },
      { name: 'Aerobics', baseCalories: { low: 6, medium: 9, high: 12 } }
    ]
  },
  strength: {
    name: 'Strength',
    activities: [
      { name: 'Gym', baseCalories: { low: 5, medium: 7, high: 9 } },
      { name: 'Bodyweight', baseCalories: { low: 4, medium: 6, high: 8 } }
    ]
  },
  other: {
    name: 'Other',
    activities: [
      { name: 'Yoga', baseCalories: { low: 3, medium: 4, high: 5 } },
      { name: 'Custom', baseCalories: { low: 4, medium: 6, high: 8 }, custom: true }
    ]
  }
}

// Storage keys
export const ACTIVITIES_COLLECTION = 'activities'
export const ACTIVITIES_STORAGE_KEY = 'biocore_activities'

let currentCategory = null
let currentActivity = null

function getUserActivityCollection() {
  const { db, userId } = getCloudContext()
  if (!db || !userId) return null
  return collection(db, 'users', userId, ACTIVITIES_COLLECTION)
}

function resolveEntryTimestamp(entry = {}) {
  const parsed = Date.parse(entry.timestamp)
  return Number.isFinite(parsed) ? parsed : 0
}

// DOM Elements
let activityModal, activityWizard, activityStep1, activityStep2, activityStep3
let activityOptions, activityDuration, activityIntensity, activityCalories
let customActivityContainer, customActivityName
let btnAddActivity, btnCloseActivity, btnBackStep2, btnBackStep3, btnSaveActivity

function getDOMElements() {
  activityModal = document.getElementById('activityModal')
  activityWizard = document.getElementById('activityWizard')
  activityStep1 = document.getElementById('activityStep1')
  activityStep2 = document.getElementById('activityStep2')
  activityStep3 = document.getElementById('activityStep3')
  activityOptions = document.getElementById('activityOptions')
  activityDuration = document.getElementById('activityDuration')
  activityIntensity = document.getElementById('activityIntensity')
  activityCalories = document.getElementById('activityCalories')
  customActivityContainer = document.getElementById('customActivityContainer')
  customActivityName = document.getElementById('customActivityName')
  btnAddActivity = document.getElementById('btnAddActivity')
  btnCloseActivity = document.getElementById('btnCloseActivity')
  btnBackStep2 = document.getElementById('btnBackStep2')
  btnBackStep3 = document.getElementById('btnBackStep3')
  btnSaveActivity = document.getElementById('btnSaveActivity')
}

function showStep(stepNumber) {
  // Hide all steps
  document.querySelectorAll('.activity-step').forEach(step => {
    step.classList.add('hidden')
  })
  
  // Show the target step
  const targetStep = document.getElementById(`activityStep${stepNumber}`)
  if (targetStep) {
    targetStep.classList.remove('hidden')
  }
}

function renderActivityOptions(category) {
  if (!activityOptions || !ACTIVITY_CONFIG[category]) return
  
  activityOptions.innerHTML = ''
  
  ACTIVITY_CONFIG[category].activities.forEach(activity => {
    const button = document.createElement('button')
    button.className = 'activity-btn'
    button.innerHTML = `
      <div style="font-weight: bold; font-size: 16px;">${activity.name}</div>
      <div style="font-size: 14px; opacity: 0.8;">
        Calories/min: ${activity.baseCalories.low}-${activity.baseCalories.high}
      </div>
    `
    button.style.cssText = 'padding: 16px; background: #1a1a1a; color: white; border: 1px solid #444; border-radius: 8px; cursor: pointer; text-align: left;'
    
    button.addEventListener('click', () => {
      currentActivity = activity
      showStep(3)
      
      // Show custom input if this is a custom activity
      if (activity.custom) {
        customActivityContainer.classList.remove('hidden')
      } else {
        customActivityContainer.classList.add('hidden')
      }
    })
    
    activityOptions.appendChild(button)
  })
}

function calculateCalories(duration, intensity, activity) {
  if (!activity || !activity.baseCalories) return 0
  
  const baseRate = activity.baseCalories[intensity] || activity.baseCalories.medium
  return Math.round(duration * baseRate)
}

async function saveActivityToFirebase(activityData) {
  try {
    const activitiesRef = getUserActivityCollection()
    if (!activitiesRef) return false
    const now = new Date()
    await addDoc(activitiesRef, {
      ...activityData,
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0]
    })
    return true
  } catch (error) {
    console.error('Error saving activity to Firebase:', error)
    return false
  }
}

function saveActivityToLocalStorage(activityData) {
  try {
    const existing = JSON.parse(localStorage.getItem(ACTIVITIES_STORAGE_KEY) || '[]')
    const updated = [...existing, {
      ...activityData,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0]
    }]
    localStorage.setItem(ACTIVITIES_STORAGE_KEY, JSON.stringify(updated))
    return true
  } catch (error) {
    console.error('Error saving activity to localStorage:', error)
    return false
  }
}

export async function saveActivity(activityData) {
  // Firebase first, fall back to localStorage
  const success = await saveActivityToFirebase(activityData)
  if (success) return true

  return saveActivityToLocalStorage(activityData)
}

export async function getTodayActivities() {
  const today = new Date().toISOString().split('T')[0]
  
  try {
    const activitiesRef = getUserActivityCollection()
    if (activitiesRef) {
      const q = query(activitiesRef, where('date', '==', today))
      const snapshot = await getDocs(q)
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => resolveEntryTimestamp(b) - resolveEntryTimestamp(a))
    }
    
    // Fall back to localStorage
    const localActivities = JSON.parse(localStorage.getItem(ACTIVITIES_STORAGE_KEY) || '[]')
    return localActivities.filter(activity => activity.date === today)
  } catch (error) {
    console.error('Error fetching today\'s activities:', error)
    return []
  }
}

export function calculateTotalActivityCalories(activities) {
  return activities.reduce((total, activity) => {
    const calories = Number(activity?.calories) || 0
    return total + calories
  }, 0)
}

function handleSaveActivity() {
  const duration = parseInt(activityDuration.value) || 0
  const intensity = activityIntensity.value
  const customCalories = parseInt(activityCalories.value) || 0
  
  if (duration <= 0) {
    alert('Please enter a valid duration')
    return
  }

  if (!currentActivity) {
    alert('Please select an activity before saving')
    return
  }
  
  let activityName = currentActivity.name
  if (currentActivity.custom && customActivityName.value.trim()) {
    activityName = customActivityName.value.trim()
  }
  
  const calories = customCalories > 0 ? customCalories : calculateCalories(duration, intensity, currentActivity)
  
  const activityData = {
    category: currentCategory,
    activity: activityName,
    duration,
    intensity,
    calories,
    timestamp: new Date().toISOString()
  }
  
  saveActivity(activityData).then(success => {
    if (success) {
      alert('Activity saved successfully!')
      closeActivityModal()
      // Trigger UI update to reflect new activity calories
      if (window.refreshMetabolicStatus) {
        window.refreshMetabolicStatus()
      }
    } else {
      alert('Failed to save activity. Please try again.')
    }
  })
}

function openActivityModal() {
  if (!activityModal) return
  
  // Reset state
  currentCategory = null
  currentActivity = null
  activityDuration.value = '30'
  activityIntensity.value = 'medium'
  activityCalories.value = ''
  customActivityName.value = ''
  customActivityContainer.classList.add('hidden')
  
  // Show first step
  showStep(1)
  
  // Show modal
  activityModal.classList.remove('hidden')
}

function closeActivityModal() {
  if (!activityModal) return
  activityModal.classList.add('hidden')
}

export function initActivityTracker() {
  getDOMElements()
  
  if (!btnAddActivity || !activityModal) {
    console.warn('Activity tracker elements not found')
    return
  }
  
  // Event listeners
  btnAddActivity.addEventListener('click', openActivityModal)
  btnCloseActivity.addEventListener('click', closeActivityModal)
  
  // Category selection
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentCategory = e.currentTarget.dataset.category
      renderActivityOptions(currentCategory)
      showStep(2)
    })
  })
  
  // Back buttons
  if (btnBackStep2) {
    btnBackStep2.addEventListener('click', () => showStep(1))
  }
  
  if (btnBackStep3) {
    btnBackStep3.addEventListener('click', () => showStep(2))
  }
  
  // Save button
  if (btnSaveActivity) {
    btnSaveActivity.addEventListener('click', handleSaveActivity)
  }
  
  // Close modal when clicking outside
  activityModal.addEventListener('click', (e) => {
    if (e.target === activityModal) {
      closeActivityModal()
    }
  })
}

// Make functions available globally for other modules
window.getTodayActivities = getTodayActivities
window.calculateTotalActivityCalories = calculateTotalActivityCalories