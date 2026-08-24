<script setup>
import { computed } from 'vue'
import { formatHours } from '@/utils/date'
import { STREAK_LEVEL_LABELS } from '@/utils/overviewStats'

const props = defineProps({
  columns: { type: Array, required: true }, // trackingStreakGrid() output
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
    return show ? col.monday.toLocaleString(undefined, { month: 'short' }).toUpperCase() : ''
  })
})

function cellTitle(day) {
  const dateLabel = day.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return day.level === 0 ? `${dateLabel} · no entry` : `${dateLabel} · ${formatHours(day.hours)}`
}
</script>

<template>
  <div class="streak">
    <div class="month-row">
      <span class="row-gutter"></span>
      <span v-for="(label, i) in monthLabels" :key="i" class="month-label">{{ label }}</span>
    </div>
    <div class="grid-row">
      <div class="row-labels">
        <span v-for="(label, i) in ROW_LABELS" :key="i" class="row-label">{{ label }}</span>
      </div>
      <div class="columns">
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
  background: color-mix(in srgb, var(--ok) 30%, var(--surface2));
}

.cell.level-2 {
  background: color-mix(in srgb, var(--ok) 55%, var(--surface2));
}

.cell.level-3 {
  background: color-mix(in srgb, var(--ok) 80%, var(--surface2));
}

.cell.level-4 {
  background: var(--ok);
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
  background: color-mix(in srgb, var(--ok) 30%, var(--surface2));
}

.scale-swatch.level-2 {
  background: color-mix(in srgb, var(--ok) 55%, var(--surface2));
}

.scale-swatch.level-3 {
  background: color-mix(in srgb, var(--ok) 80%, var(--surface2));
}

.scale-swatch.level-4 {
  background: var(--ok);
}
</style>
