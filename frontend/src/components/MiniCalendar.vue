<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { getMonday, toISODate, addDays } from '@/utils/date'

const props = defineProps({
  monday: { type: Date, required: true }, // week currently shown - used to seed the month and highlight its days
  anchor: { type: Object, default: null }, // template ref of the trigger button - positions the teleported popup under it
})

const emit = defineEmits(['select'])

// Teleported to <body> (see template) so this can never end up trapped
// behind a day-row entry block - those got their own stacking context once
// the motion pass gave them a resting `transform: scaleX(1)`, which briefly
// let them paint over a same-page-positioned popover despite its z-index.
// Since it's no longer a descendant of the trigger button, position is
// computed from the button's own rect instead of relying on CSS being
// relative to a parent.
const popupStyle = ref({})

function computePosition() {
  const rect = props.anchor?.getBoundingClientRect?.()
  if (!rect) return
  // Right-edge aligned rather than centered under the button - the button
  // sits close to the page's right edge, so centering could push the wider
  // calendar panel half off-screen.
  popupStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 8}px`,
    right: `${window.innerWidth - rect.right}px`,
  }
}

onMounted(() => {
  computePosition()
  // The button's label is set in a web font (IBM Plex Mono) - if it's still
  // loading at mount time, the button briefly renders in a fallback font
  // with different metrics, so its measured width (and right edge) can
  // shift once the real font swaps in. Re-measuring once fonts are
  // confirmed loaded (and on resize, for the same reason in general)
  // keeps this from drifting out of alignment.
  document.fonts?.ready?.then(computePosition)
  window.addEventListener('resize', computePosition)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', computePosition)
})

const viewMonth = ref(new Date(props.monday.getFullYear(), props.monday.getMonth(), 1))

const monthLabel = computed(() => viewMonth.value.toLocaleString('en-GB', { month: 'long', year: 'numeric' }))

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const gridDays = computed(() => {
  const gridStart = getMonday(viewMonth.value)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
})

const todayIso = toISODate(new Date())
const selectedWeekMondayIso = computed(() => toISODate(props.monday))

function isCurrentMonth(date) {
  return date.getMonth() === viewMonth.value.getMonth()
}

function isToday(date) {
  return toISODate(date) === todayIso
}

function isInSelectedWeek(date) {
  return toISODate(getMonday(date)) === selectedWeekMondayIso.value
}

function prevMonth() {
  viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() - 1, 1)
}

function nextMonth() {
  viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() + 1, 1)
}
</script>

<template>
  <Teleport to="body">
    <div class="mini-calendar" :style="popupStyle" @click.stop>
      <div class="cal-header">
        <button type="button" class="cal-nav" @click="prevMonth" aria-label="Previous month"><ChevronLeft :size="14" /></button>
        <span class="cal-month-label">{{ monthLabel }}</span>
        <button type="button" class="cal-nav" @click="nextMonth" aria-label="Next month"><ChevronRight :size="14" /></button>
      </div>

      <div class="cal-weekdays">
        <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
      </div>

      <div class="cal-grid">
        <button
          v-for="date in gridDays"
          :key="toISODate(date)"
          type="button"
          class="cal-day"
          :class="{
            'is-outside': !isCurrentMonth(date),
            'is-today': isToday(date),
            'is-in-week': isInSelectedWeek(date),
          }"
          @click="emit('select', date)"
        >
          {{ date.getDate() }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mini-calendar {
  z-index: 300;
  width: 16rem;
  background: var(--surface);
  border: 1px solid var(--line-2);
  border-radius: var(--r2);
  padding: 0.75rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.cal-month-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--fg);
}

.cal-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--dim);
  cursor: pointer;
}

.cal-nav:hover {
  border-color: var(--accent);
  color: var(--fg);
}

.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 0.2rem;
}

.cal-weekdays span {
  text-align: center;
  font-size: 0.65rem;
  opacity: 0.55;
  font-weight: 600;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.15rem;
}

.cal-day {
  aspect-ratio: 1;
  border-radius: var(--r);
  border: none;
  background: transparent;
  color: var(--dim);
  font-size: 0.75rem;
  cursor: pointer;
}

.cal-day:hover {
  background: var(--surface2);
}

.cal-day.is-outside {
  opacity: 0.35;
}

.cal-day.is-in-week {
  background: var(--accent-tint);
  color: var(--fg);
}

.cal-day.is-today {
  font-weight: 700;
  box-shadow: inset 0 0 0 1px var(--accent);
}

.cal-day.is-in-week:hover,
.cal-day.is-today:hover {
  background: var(--accent);
  color: var(--bg);
}
</style>
