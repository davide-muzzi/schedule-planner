import { ref } from 'vue'

// Same module-level-singleton shape as toast.js - a store action can't
// render a modal itself, so it reaches into this shared state and RetrySkipDialog
// (mounted once in App.vue) reacts to it.
export const retryPromptVisible = ref(false)
export const retryPromptMessage = ref('')

let resolver = null

// Shows a Retry/Skip prompt and resolves once the user picks one - true for
// Retry, false for Skip. Callers await this directly, so whatever loop
// triggered it (e.g. importSnapshot recreating one record) naturally pauses
// until the user responds.
export function askRetryOrSkip(message) {
  retryPromptMessage.value = message
  retryPromptVisible.value = true
  return new Promise((resolve) => {
    resolver = resolve
  })
}

export function resolveRetryPrompt(shouldRetry) {
  retryPromptVisible.value = false
  resolver?.(shouldRetry)
  resolver = null
}
