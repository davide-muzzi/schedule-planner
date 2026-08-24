import { ref } from 'vue'

export const toastMessage = ref('')
export const toastVisible = ref(false)
export const toastVariant = ref('error') // 'error' (red - warnings, deletions) | 'warn' (yellow - edits)
export const toastAction = ref(null) // { label, onClick } | null

let hideTimer = null

// options: { duration = 3000, variant = 'error', actionLabel, onAction }
// actionLabel/onAction together add a clickable action (e.g. "Undo") -
// clicking it runs onAction and dismisses the toast immediately.
export function showToast(message, options = {}) {
  const { duration = 3000, variant = 'error', actionLabel = null, onAction = null } = options
  toastMessage.value = message
  toastVariant.value = variant
  toastAction.value = actionLabel && onAction ? { label: actionLabel, onClick: onAction } : null
  toastVisible.value = true
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    toastVisible.value = false
  }, duration)
}

export function hideToast() {
  clearTimeout(hideTimer)
  toastVisible.value = false
}
