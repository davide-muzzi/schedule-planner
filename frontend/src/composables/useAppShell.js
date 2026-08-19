import { ref, watch } from 'vue'

// Shared app-shell chrome state (sidebar theme + collapsed width) - a plain
// module-level singleton rather than a Pinia store, since this is pure UI
// preference with no server round-trip, same pattern as the existing
// displayName localStorage handling in scheduleStore.
const THEME_KEY = 'schedulePlanner.theme'
const COLLAPSED_KEY = 'schedulePlanner.sidebarCollapsed'

function initialTheme() {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches === false ? 'light' : 'dark'
}

const theme = ref(initialTheme())
const collapsed = ref(localStorage.getItem(COLLAPSED_KEY) === 'true')

function applyTheme(value) {
  document.documentElement.dataset.theme = value
}

// Applied immediately (module init) so the correct theme is already on the
// root element before Vue ever mounts - avoids a flash of the wrong theme.
applyTheme(theme.value)

watch(theme, (value) => {
  localStorage.setItem(THEME_KEY, value)
  applyTheme(value)
})

watch(collapsed, (value) => {
  localStorage.setItem(COLLAPSED_KEY, String(value))
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

  return { theme, collapsed, toggleTheme, setTheme, toggleCollapsed }
}
