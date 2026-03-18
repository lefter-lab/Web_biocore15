import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.8.0/firebase-app.js'
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js'
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js'
import {
  setCloudContext,
  clearCloudContext,
  pullCloudSnapshot,
  applyRemoteSnapshot,
  exportLocalSnapshot,
  pushLocalSnapshotToCloud,
  setLocalStorageEnabled
} from './storage.js'
import { renderFoodLibraryOptions, rerenderMeals, renderJsonList, updateNightTestPanel, toggleSignupFormVisibility } from './handlers.js'
import { renderFineLog } from './ui_render.js'

const firebaseConfig = {
  apiKey: 'AIzaSyDyy8onQf7ZUrBgfG5VEWSfYLF4BGRLH2w',
  authDomain: 'biocore15-web.firebaseapp.com',
  projectId: 'biocore15-web',
  storageBucket: 'biocore15-web.firebasestorage.app',
  messagingSenderId: '633394396470',
  appId: '1:633394396470:web:716383121b268f686bc797'
}

const firebaseApp = initializeApp(firebaseConfig)
const auth = getAuth(firebaseApp)
const firestore = getFirestore(firebaseApp)
const googleProvider = new GoogleAuthProvider()
const migrationPromptedUsers = new Set()

const loginGate = document.getElementById('loginGate')
const appShell = document.getElementById('appShell')

function hasSnapshotData(snapshot) {
  if (!snapshot) return false
  const items = Array.isArray(snapshot.biocore_items) ? snapshot.biocore_items.length : 0
  const meals = Array.isArray(snapshot.biocore_meals_log) ? snapshot.biocore_meals_log.length : 0
  const nightTests = Array.isArray(snapshot.biocore_night_tests) ? snapshot.biocore_night_tests.length : 0
  return items > 0 || meals > 0 || nightTests > 0
}

export function setLockedState(isLocked) {
  if (loginGate) loginGate.classList.toggle('hidden', !isLocked)
  if (appShell) appShell.classList.toggle('locked', isLocked)
  if (isLocked) {
    toggleSignupFormVisibility(false)
  }
}

async function syncUserData(user) {
  const remoteSnapshot = await pullCloudSnapshot()
  const hasRemote = hasSnapshotData(remoteSnapshot)
  const localSnapshot = exportLocalSnapshot()
  const hasLocal = hasSnapshotData(localSnapshot)
  if (hasRemote) {
    await applyRemoteSnapshot(remoteSnapshot)
    renderFoodLibraryOptions()
    rerenderMeals()
    renderFineLog()
    renderJsonList(new Date())
    updateNightTestPanel()
  } else if (hasLocal && !migrationPromptedUsers.has(user.uid)) {
    migrationPromptedUsers.add(user.uid)
    const shouldUpload = window.confirm('Имате локални данни. Да ги качим в облака, за да ги запазим?')
    if (shouldUpload) {
      await pushLocalSnapshotToCloud()
    }
  }
}

export function updateAuthUI(user) {
  const authStatusNode = document.getElementById('authStatus')
  const authUserDetailsNode = document.getElementById('authUserDetails')
  const btnSignOut = document.getElementById('btnSignOut')
  if (!authStatusNode) return
  const currentUser = user || auth.currentUser
  if (currentUser) {
    const label = currentUser.displayName || currentUser.email || 'потребител'
    authStatusNode.textContent = `Влязъл: ${label}`
    if (authUserDetailsNode) {
      if (currentUser.photoURL) {
        authUserDetailsNode.innerHTML = `<img src="${currentUser.photoURL}" alt="avatar" style="width:24px;height:24px;border-radius:50%;margin-right:6px;vertical-align:middle;"> ${label}`
      } else {
        authUserDetailsNode.textContent = label
      }
    }
    if (btnSignOut) btnSignOut.style.display = 'inline-flex'
  } else {
    authStatusNode.textContent = 'Не сте логнати'
    if (authUserDetailsNode) authUserDetailsNode.textContent = ''
    if (btnSignOut) btnSignOut.style.display = 'none'
  }
}

export async function handleAuthStateChange(user) {
  setLockedState(!user)
  setLocalStorageEnabled(Boolean(user))
  updateAuthUI(user)
  if (user) {
    setCloudContext(user.uid, firestore)
    await syncUserData(user)
  } else {
    clearCloudContext()
    migrationPromptedUsers.clear()
    updateNightTestPanel()
  }
}

export async function handleGoogleLogin() {
  try {
    await signInWithPopup(auth, googleProvider)
  } catch (err) {
    console.error('Google sign-in failed', err)
  }
}

export async function handleEmailAuth(ev) {
  if (ev) ev.preventDefault()
  const emailInput = document.getElementById('emailInput')
  const passwordInput = document.getElementById('passwordInput')
  const email = (emailInput?.value || '').trim()
  const password = passwordInput?.value || ''
  if (!email || !password) return
  try {
    await signInWithEmailAndPassword(auth, email, password)
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      try {
        await createUserWithEmailAndPassword(auth, email, password)
      } catch (createErr) {
        console.error('Could not create account', createErr)
      }
    } else {
      console.error('Email sign-in failed', err)
    }
  }
}

export async function handleEmailSignup(ev) {
  if (ev) ev.preventDefault()
  const signupEmailInput = document.getElementById('signupEmail')
  const signupPasswordInput = document.getElementById('signupPassword')
  const email = (signupEmailInput?.value || '').trim()
  const password = signupPasswordInput?.value || ''
  if (!email || !password) return
  try {
    await createUserWithEmailAndPassword(auth, email, password)
    if (signupEmailInput) signupEmailInput.value = ''
    if (signupPasswordInput) signupPasswordInput.value = ''
    toggleSignupFormVisibility(false)
  } catch (err) {
    console.error('Sign-up failed', err)
  }
}

export async function handleSignOut() {
  try {
    await signOut(auth)
  } catch (err) {
    console.error('Sign-out failed', err)
  }
}

export function initFirebaseAuth() {
  onAuthStateChanged(auth, (user) => {
    void handleAuthStateChange(user).catch((err) => console.error('Auth sync failed', err))
  })
}
