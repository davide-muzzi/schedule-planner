import { nextTick, onBeforeUnmount, ref } from 'vue'

// Tracks a single open-by-id popover (e.g. a priority picker rendered once
// per row in a v-for) and its fixed-position screen coordinates, computed
// from the trigger element's own bounding rect. Meant to be paired with a
// <Teleport to="body"> around the popover markup so it renders above any
// ancestor's overflow:auto/hidden instead of getting clipped by it (e.g. a
// scrollable subtask list) - position:fixed coordinates are relative to the
// viewport, so they stay correct regardless of what DOM node the popover
// actually lives under once teleported.
export function useFloatingMenu() {
  const openId = ref(null)
  const position = ref({ top: 0, left: 0 })
  // Bind this to the teleported popover's root element via `:ref="setMenuEl"`
  // (a function ref, NOT a string ref="menuEl") so outside-click detection
  // can tell "clicked one of the popover's own options" apart from "clicked
  // away". Must be a function ref specifically: the popover markup lives
  // lexically inside a v-for (one row per subtask), and Vue auto-collects a
  // string ref inside a v-for into an *array* even though at most one
  // instance is ever actually mounted (the v-if only lets one row's popover
  // exist at a time) - that silently made menuEl.value an array, which has
  // no .contains(), throwing inside handleOutside and killing it before it
  // ever reached close().
  const menuEl = ref(null)
  function setMenuEl(el) {
    menuEl.value = el
  }
  let triggerEl = null

  function place() {
    if (!triggerEl) return
    const rect = triggerEl.getBoundingClientRect()
    position.value = { top: rect.bottom + 4, left: rect.left }
  }

  // Capture phase, not bubble - the rows this popover lives in (e.g.
  // TaskCard's subtask rows) have their own click.stop handlers for
  // unrelated things (expanding a row's detail, etc.), which would block a
  // bubble-phase document listener from ever seeing the click. Capture
  // fires top-down before any of those descendant handlers get a chance to
  // stop propagation, so an outside click reliably closes this regardless
  // of what else is listening on the way down to the actual target.
  function handleOutside(event) {
    if (triggerEl && triggerEl.contains(event.target)) return
    if (menuEl.value && menuEl.value.contains(event.target)) return
    close()
  }

  function close() {
    openId.value = null
    triggerEl = null
    window.removeEventListener('scroll', place, true)
    window.removeEventListener('resize', place)
    document.removeEventListener('mousedown', handleOutside, true)
  }

  // `event` is the click that opened this popover - its currentTarget is
  // the trigger button the popover should stay anchored to.
  function toggle(id, event) {
    if (openId.value === id) {
      close()
      return
    }
    openId.value = id
    triggerEl = event.currentTarget
    place()
    nextTick(() => {
      window.addEventListener('scroll', place, true)
      window.addEventListener('resize', place)
      document.addEventListener('mousedown', handleOutside, true)
    })
  }

  onBeforeUnmount(close)

  return { openId, position, setMenuEl, toggle, close }
}
