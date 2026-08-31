<script setup>
import { computed, watch, onMounted } from 'vue'
import { formatHours } from '@/utils/date'
import { STREAK_LEVEL_LABELS } from '@/utils/overviewStats'
import { useAppShell } from '@/composables/useAppShell'
import { useLinkedScroll } from '@/composables/useLinkedScroll'

const props = defineProps({
  columns: { type: Array, required: true }, // trackingStreakGrid() output
})

const { isNarrowViewport } = useAppShell()

// Same "fixed size + scroll, roughly half the range visible at once" idea
// as the weekly-hours chart, and the same two-strips-in-lockstep mechanics
// (the cell grid and the month-label row above it).
const { primaryEl: columnsEl, secondaryEl: monthLabelsEl, onPrimaryScroll, onSecondaryScroll, scrollToEnd } =
  useLinkedScroll()

watch([() => props.columns, isNarrowViewport], () => {
  if (isNarrowViewport.value) scrollToEnd()
})
onMounted(() => {
  if (isNarrowViewport.value) scrollToEnd()
})

// Row 0 is Monday (trackingStreakGrid's days array is Mon-Sun, matching
// getMonday()'s week start) - the label positions must match that, not the
// Sun-Sat order a raw Date.getDay() index would imply.
const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']

// A month label sits above the first column that starts a new month - blank
// slots elsewhere keep it aligned above the matching column in the grid row
// beneath it (both rows use the same flex:1 slot count and gap).
const monthLabels = computed(() => {
  let lastMonth = null
  return props.columns.map((col) => {
    const month = col.monday.getMonth()
    const show = month !== lastMonth
    lastMonth = month
    return show ? col.monday.toLocaleString('en-GB', { month: 'short' }).toUpperCase() : ''
  })
})

function cellTitle(day) {
  const dateLabel = day.date.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })
  return day.level === 0 ? `${dateLabel} · no entry` : `${dateLabel} · ${formatHours(day.hours)}`
}
</script>

<template>
  <div class="streak" :class="{ 'mobile-scroll': isNarrowViewport }">
    <div class="month-row">
      <span class="row-gutter"></span>
      <div class="month-labels" ref="monthLabelsEl" @scroll="onSecondaryScroll">
        <span v-for="(label, i) in monthLabels" :key="i" class="month-label">{{ label }}</span>
      </div>
    </div>
    <div class="grid-row">
      <div class="row-labels">
        <span v-for="(label, i) in ROW_LABELS" :key="i" class="row-label">{{ label }}</span>
      </div>
      <div class="columns" ref="columnsEl" @scroll="onPrimaryScroll">
        <div v-for="(col, c) in columns" :key="col.monday.getTime()" class="column">
          <span
            v-for="day in col.days"
            :key="day.iso"
            class="cell"
            :class="'level-' + day.level"
            :style="{ animationDelay: c * 9 + 'ms' }"
            :title="cellTitle(day)"
          ></span>
        </div>
      </div>
    </div>
    <div class="scale-footer">
      <span>LESS</span>
      <span
        v-for="level in [0, 1, 2, 3, 4]"
        :key="level"
        class="scale-swatch"
        :class="'level-' + level"
        :title="STREAK_LEVEL_LABELS[level]"
      ></span>
      <span>MORE</span>
    </div>
  </div>
</template>

<style scoped>
.streak {
  width: 100%;
}

.month-row {
  display: flex;
  gap: 3px;
  margin-bottom: 5px;
}

.row-gutter {
  width: 26px;
  flex-shrink: 0;
}

.month-labels {
  display: flex;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.month-label {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--mute);
  white-space: nowrap;
  overflow: visible;
}

.grid-row {
  display: flex;
  align-items: stretch;
}

.row-labels {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 26px;
  flex-shrink: 0;
}

.row-label {
  flex: 1;
  display: flex;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--mute);
}

.columns {
  display: flex;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.cell {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 2px;
  animation: fadeIn 0.5s ease both;
}

.cell.level-0 {
  background: var(--surface2);
}

.cell.level-1 {
  background: var(--bad);
}

.cell.level-2 {
  background: var(--warn);
}

.cell.level-3 {
  background: var(--ok);
}

.cell.level-4 {
  background: var(--accent);
}

.scale-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--mute);
  letter-spacing: 0.1em;
}

.scale-swatch {
  width: 11px;
  height: 11px;
  border-radius: 2px;
}

.scale-swatch.level-0 {
  background: var(--surface2);
}

.scale-swatch.level-1 {
  background: var(--bad);
}

.scale-swatch.level-2 {
  background: var(--warn);
}

.scale-swatch.level-3 {
  background: var(--ok);
}

.scale-swatch.level-4 {
  background: var(--accent);
}

/* Mobile: fixed, bigger cells instead of auto-shrinking to fit all 52 weeks
   in the available width - naturally only shows part of the range at once,
   the rest reachable by scrolling (synced between the grid and the month
   labels above it, same mechanism as the weekly-hours chart). */
.streak.mobile-scroll .columns {
  overflow-x: auto;
  scrollbar-width: none;
}

.streak.mobile-scroll .columns::-webkit-scrollbar {
  display: none;
}

.streak.mobile-scroll .column {
  flex: none;
  width: 22px;
}

.streak.mobile-scroll .month-labels {
  overflow-x: auto;
  scrollbar-width: none;
}

.streak.mobile-scroll .month-labels::-webkit-scrollbar {
  display: none;
}

.streak.mobile-scroll .month-label {
  flex: none;
  width: 22px;
}
</style>
