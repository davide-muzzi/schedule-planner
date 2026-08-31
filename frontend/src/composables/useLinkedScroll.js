import { ref, nextTick } from 'vue'

// Keeps two independently-scrollable horizontal strips in lockstep (a chart's
// bars and its axis labels, a streak grid and its month row) - each has its
// own native overflow-x:auto so touch/trackpad scrolling works on either,
// and a scroll on one mirrors into the other. The `syncing` guard stops that
// mirroring from bouncing back and forth between the two.
export function useLinkedScroll() {
  const primaryEl = ref(null)
  const secondaryEl = ref(null)
  let syncing = false

  function mirror(from, to) {
    if (syncing || !from || !to) return
    syncing = true
    to.scrollLeft = from.scrollLeft
    syncing = false
  }

  function onPrimaryScroll() {
    mirror(primaryEl.value, secondaryEl.value)
  }

  function onSecondaryScroll() {
    mirror(secondaryEl.value, primaryEl.value)
  }

  // Lands the strip on its most recent (rightmost) content by default -
  // waits a tick so this runs after the fixed-width content has actually
  // laid out and has a real scrollWidth to scroll to.
  async function scrollToEnd() {
    await nextTick()
    if (primaryEl.value) primaryEl.value.scrollLeft = primaryEl.value.scrollWidth
    if (secondaryEl.value) secondaryEl.value.scrollLeft = secondaryEl.value.scrollWidth
  }

  return { primaryEl, secondaryEl, onPrimaryScroll, onSecondaryScroll, scrollToEnd }
}
