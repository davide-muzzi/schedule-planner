import { ref } from 'vue'

export const toastMessage = ref('')
export const toastVisible = ref(false)

let hideTimer = null

export function showToast(message, duration = 3000) {
  toastMessage.value = message
  toastVisible.value = true
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    toastVisible.value = false
  }, duration)
}
