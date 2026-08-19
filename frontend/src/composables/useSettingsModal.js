import { ref } from 'vue'

// Settings is opened from the sidebar nav now instead of a per-page header
// button, so "is it open" needs to live above any single view. A module
// singleton is enough - there's only ever one settings modal in the app.
const isOpen = ref(false)

export function useSettingsModal() {
  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  return { isOpen, open, close }
}
