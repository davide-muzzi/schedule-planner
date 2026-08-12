<script setup>
import { computed } from 'vue'
import { formatDayHeading, durationHours, timeToDecimalHours, formatHours, toISODate } from '@/utils/date'
import { colorStyle } from '@/utils/colorPresets'

const props = defineProps({
  date: { type: Date, required: true },
  entries: { type: Array, default: () => [] },
})

const emit = defineEmits(['add', 'edit'])

const hours = Array.from({ length: 24 }, (_, i) => i)

const allDayEntries = computed(() => props.entries.filter((e) => e.allDay))
const timedEntries = computed(() => props.entries.filter((e) => !e.allDay))

const dayTotalHours = computed(() =>
  props.entries
    .filter((e) => e.entryType === 'Working' && !e.allDay)
    .reduce((sum, e) => sum + durationHours(e.startTime, e.endTime), 0),
)

const isToday = computed(() => toISODate(props.date) === toISODate(new Date()))

function blockStyle(entry) {
  const start = timeToDecimalHours(entry.startTime) ?? 0
  const duration = Math.max(durationHours(entry.startTime, entry.endTime), 0.25)
  const style = colorStyle(entry.colorPreset)
  return {
    left: `${(start / 24) * 100}%`,
    width: `${(duration / 24) * 100}%`,
    backgroundColor: style.bg,
    color: style.text,
    borderColor: style.border,
  }
}

function bannerStyle(entry) {
  const style = colorStyle(entry.colorPreset)
  return {
    backgroundColor: style.bg,
    color: style.text,
    borderColor: style.border,
  }
}

function entryLabel(entry) {
  return entry.title || entry.entryType
}
</script>

<template>
  <section class="day-table" :class="{ 'is-today': isToday }">
    <header class="day-heading">
      <h3>{{ formatDayHeading(date) }}</h3>
      <button class="add-btn" type="button" @click="emit('add', date)">+ Add</button>
    </header>

    <table>
      <thead>
        <tr>
          <th v-for="h in hours" :key="h" class="hour-label">{{ h }}</th>
          <th class="total-label">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in allDayEntries" :key="'allday-' + entry.id" class="all-day-row">
          <td colspan="24" class="all-day-cell" :style="bannerStyle(entry)" @click="emit('edit', entry)">
            {{ entryLabel(entry) }} ({{ entry.entryType }})
          </td>
          <td class="total-cell">&mdash;</td>
        </tr>
        <tr class="timeline-row">
          <td colspan="24" class="hour-track">
            <div class="track-grid">
              <span v-for="h in hours" :key="h" class="grid-line"></span>
            </div>
            <div class="blocks">
              <div
                v-for="entry in timedEntries"
                :key="entry.id"
                class="block"
                :style="blockStyle(entry)"
                :title="`${entryLabel(entry)} — ${entry.startTime?.slice(0, 5)}–${entry.endTime?.slice(0, 5)}`"
                @click="emit('edit', entry)"
              >
                {{ entryLabel(entry) }}
              </div>
            </div>
          </td>
          <td class="total-cell">{{ formatHours(dayTotalHours) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.day-table {
  margin-bottom: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem 1rem 1rem;
  background: var(--color-background-soft);
}

.day-table.is-today {
  border-color: #3b82f6;
}

.day-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.day-heading h3 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-heading);
}

.add-btn {
  font-size: 0.75rem;
  padding: 0.15rem 0.55rem;
  border-radius: 5px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.add-btn:hover {
  border-color: var(--color-border-hover);
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.hour-label {
  font-size: 0.65rem;
  font-weight: 400;
  color: var(--color-text);
  opacity: 0.6;
  text-align: center;
  padding-bottom: 0.25rem;
  width: calc(100% / 25);
}

.total-label {
  font-size: 0.7rem;
  text-align: center;
  width: 4.5rem;
}

.hour-track {
  position: relative;
  height: 2.5rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.track-grid {
  position: absolute;
  inset: 0;
  display: flex;
}

.grid-line {
  flex: 1;
  border-right: 1px solid var(--color-border);
}

.grid-line:last-child {
  border-right: none;
}

.blocks {
  position: absolute;
  inset: 2px;
}

.block {
  position: absolute;
  top: 0;
  bottom: 0;
  border: 1px solid;
  border-radius: 3px;
  font-size: 0.7rem;
  line-height: 1;
  padding: 0.3rem 0.35rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}

.total-cell {
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
  width: 4.5rem;
  white-space: nowrap;
}

.all-day-row .all-day-cell {
  border-radius: 4px;
  border: 1px solid;
  font-size: 0.75rem;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
}

.all-day-row td {
  padding-bottom: 0.35rem;
}
</style>
