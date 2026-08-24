import { ref } from 'vue'

// A small teleported hover tooltip for chart marks (bars, points) - same
// positioning approach as DayTable's entry tooltip (fixed, centered on the
// hovered element, flipped above when there's no room below), but with a
// short show delay so a mouse merely passing over several marks in a row
// doesn't flash a tooltip per mark, while still feeling near-instant
// compared to the browser's native `title` delay.
export function useChartTooltip(showDelayMs = 150) {
  const active = ref(null)
  const style = ref({})
  let showTimer = null

  function show(event, data) {
    clearTimeout(showTimer)
    const target = event.currentTarget
    showTimer = setTimeout(() => {
      const rect = target.getBoundingClientRect()
      const left = Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90)
      const spaceBelow = window.innerHeight - rect.bottom
      style.value =
        spaceBelow < 140
          ? { left: `${left}px`, bottom: `${window.innerHeight - rect.top + 8}px` }
          : { left: `${left}px`, top: `${rect.bottom + 8}px` }
      active.value = data
    }, showDelayMs)
  }

  function hide() {
    clearTimeout(showTimer)
    active.value = null
  }

  return { active, style, show, hide }
}
