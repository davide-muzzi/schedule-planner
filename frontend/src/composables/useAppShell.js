import { ref, watch } from 'vue'

// Shared app-shell chrome state (sidebar theme + collapsed width + motion
// preference) - a plain module-level singleton rather than a Pinia store,
// since this is pure UI preference with no server round-trip, same pattern
// as the existing displayName localStorage handling in scheduleStore.
const THEME_KEY = 'schedulePlanner.theme'
const COLLAPSED_KEY = 'schedulePlanner.sidebarCollapsed'
const RESPECT_REDUCED_MOTION_KEY = 'schedulePlanner.respectReducedMotion'

function initialTheme() {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches === false ? 'light' : 'dark'
}

const theme = ref(initialTheme())
const collapsed = ref(localStorage.getItem(COLLAPSED_KEY) === 'true')

// Off by default (respect the OS) - this only comes into play for people
// who explicitly flip it, so accessibility intent stays the default.
const respectReducedMotion = ref(localStorage.getItem(RESPECT_REDUCED_MOTION_KEY) !== 'false')

// Tracked separately from the toggle above so the two can be combined - the
// OS can change this live (e.g. someone flips it in Settings while the tab
// is open) without needing a page reload to pick it up.
const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
const osReducedMotion = ref(reducedMotionQuery?.matches ?? false)
reducedMotionQuery?.addEventListener('change', (e) => {
  osReducedMotion.value = e.matches
})

function applyTheme(value) {
  document.documentElement.dataset.theme = value
}

// Only actually reduces motion when the OS asks for it AND the user hasn't
// overridden that - see base.css, which keys its motion-killing rules off
// this attribute instead of a raw @media query so it can be toggled from JS.
function applyReducedMotion() {
  document.documentElement.dataset.reduceMotion = osReducedMotion.value && respectReducedMotion.value ? 'true' : 'false'
}

// Applied immediately (module init) so the correct theme/motion state is
// already on the root element before Vue ever mounts - avoids a flash.
applyTheme(theme.value)
applyReducedMotion()

watch(theme, (value) => {
  localStorage.setItem(THEME_KEY, value)
  applyTheme(value)
})

watch(collapsed, (value) => {
  localStorage.setItem(COLLAPSED_KEY, String(value))
})

watch([osReducedMotion, respectReducedMotion], () => {
  localStorage.setItem(RESPECT_REDUCED_MOTION_KEY, String(respectReducedMotion.value))
  applyReducedMotion()
})

export function useAppShell() {
  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function setTheme(value) {
    theme.value = value
  }

  function toggleCollapsed() {
    collapsed.value = !collapsed.value
  }

  function setRespectReducedMotion(value) {
    respectReducedMotion.value = value
  }

  return {
    theme,
    collapsed,
    toggleTheme,
    setTheme,
    toggleCollapsed,
    respectReducedMotion,
    setRespectReducedMotion,
  }
}
