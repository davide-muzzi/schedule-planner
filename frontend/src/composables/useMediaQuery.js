import { ref, onMounted, onBeforeUnmount } from 'vue'

// Reactive `matches` for a CSS media query, scoped to the calling
// component's lifetime (unlike useAppShell's app-wide narrow-viewport
// query, which lives for the whole session).
export function useMediaQuery(query) {
  const mql = window.matchMedia?.(query)
  const matches = ref(mql?.matches ?? false)
  const onChange = (e) => {
    matches.value = e.matches
  }
  onMounted(() => mql?.addEventListener('change', onChange))
  onBeforeUnmount(() => mql?.removeEventListener('change', onChange))
  return matches
}
