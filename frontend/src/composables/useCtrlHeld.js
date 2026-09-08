import { onBeforeUnmount, onMounted, ref } from 'vue'

// A single shared "is Ctrl currently held" flag, backed by one set of
// window-level key listeners regardless of how many components ask for it
// (e.g. every TaskCard on the Kanban board) - reference-counted so the
// listeners are only attached while at least one caller is mounted.
const ctrlHeld = ref(false)
let refCount = 0

function handleKeydown(event) {
  if (event.key === 'Control') ctrlHeld.value = true
}

function handleKeyup(event) {
  if (event.key === 'Control') ctrlHeld.value = false
}

// Alt-tabbing away (or anything else that steals focus) while Ctrl is
// physically held never fires its keyup in this window - without this the
// flag would get stuck true.
function handleBlur() {
  ctrlHeld.value = false
}

export function useCtrlHeld() {
  onMounted(() => {
    if (refCount === 0) {
      window.addEventListener('keydown', handleKeydown)
      window.addEventListener('keyup', handleKeyup)
      window.addEventListener('blur', handleBlur)
    }
    refCount++
  })

  onBeforeUnmount(() => {
    refCount--
    if (refCount === 0) {
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('keyup', handleKeyup)
      window.removeEventListener('blur', handleBlur)
    }
  })

  return ctrlHeld
}
