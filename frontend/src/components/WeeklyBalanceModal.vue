<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { formatWeekRange, formatHours } from '@/utils/date'
import { RED_THRESHOLD_HOURS, YELLOW_THRESHOLD_HOURS } from '@/utils/constants'

const props = defineProps({
  weeks: { type: Array, required: true }, // [{ monday, workedHours, diffHours }]
  manualAdjustmentHours: { type: Number, required: true },
})

const emit = defineEmits(['close'])

const totalWorkedHours = computed(() => props.weeks.reduce((sum, w) => sum + w.workedHours, 0))
const totalDiffHours = computed(
  () => props.weeks.reduce((sum, w) => sum + w.diffHours, 0) + props.manualAdjustmentHours,
)

function status(diffHours) {
  if (diffHours >= 0) return 'green' // goal reached or exceeded
  const shortfall = Math.abs(diffHours)
  if (shortfall > RED_THRESHOLD_HOURS) return 'red'
  if (shortfall > YELLOW_THRESHOLD_HOURS) return 'yellow'
  return 'green'
}

function diffLabel(diffHours) {
  if (Math.abs(diffHours) < 0.01) return 'on target'
  const label = formatHours(Math.abs(diffHours))
  return diffHours > 0 ? `${label} over` : `${label} under`
}

// The correction is a manual adjustment, not a performance signal against
// the goal - shown plainly (signed amount), not colored like the diff rows.
function correctionLabel(hours) {
  if (Math.abs(hours) < 0.01) return 'No correction'
  const sign = hours > 0 ? '+' : '-'
  return `${sign}${formatHours(Math.abs(hours))}`
}

function handleKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal">
      <header class="modal-header">
        <h2>Weekly Balance</h2>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close">&times;</button>
      </header>

      <p v-if="weeks.length === 0" class="empty-state">No weeks with Working entries yet.</p>

      <table v-else class="weeks-table">
        <thead>
          <tr>
            <th>Week</th>
            <th>Worked</th>
            <th>Diff</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="week in weeks" :key="week.monday.getTime()">
            <td>{{ formatWeekRange(week.monday) }}</td>
            <td>{{ formatHours(week.workedHours) }}</td>
            <td :class="'status-' + status(week.diffHours)">{{ diffLabel(week.diffHours) }}</td>
          </tr>
        </tbody>
        <tbody>
          <tr class="correction-row">
            <td>Manual correction</td>
            <td>&mdash;</td>
            <td>{{ correctionLabel(manualAdjustmentHours) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="totals-row">
            <td>Total</td>
            <td>{{ formatHours(totalWorkedHours) }}</td>
            <td :class="'status-' + status(totalDiffHours)">{{ diffLabel(totalDiffHours) }}</td>
          </tr>
        </tfoot>
      </table>

      <footer class="modal-footer">
        <button type="button" class="cancel-btn" @click="emit('close')">Close</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}

.modal {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  width: 100%;
  max-width: 28rem;
  max-height: 85vh;
  overflow-y: auto;
  padding: 1.25rem 1.5rem 1.5rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.modal-header h2 {
  font-size: 1.1rem;
  color: var(--color-heading);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text);
}

.empty-state {
  font-size: 0.85rem;
  opacity: 0.7;
  padding: 1rem 0;
}

.weeks-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.weeks-table th {
  text-align: left;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-heading);
  opacity: 0.7;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.weeks-table th:not(:first-child),
.weeks-table td:not(:first-child) {
  text-align: right;
}

.weeks-table td {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  white-space: nowrap;
}

.weeks-table tbody tr:last-child td {
  border-bottom: none;
}

.correction-row td {
  padding-top: 0.75rem;
  border-top: 2px solid var(--color-border);
  border-bottom: none;
  opacity: 0.8;
}

.totals-row td {
  padding-top: 0.75rem;
  border-top: 2px solid var(--color-border);
  border-bottom: none;
  font-weight: 700;
}

.weeks-table td.status-green {
  color: #16a34a;
  font-weight: 600;
}

.weeks-table td.status-yellow {
  color: #ca8a04;
  font-weight: 600;
}

.weeks-table td.status-red {
  color: #dc2626;
  font-weight: 600;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1rem;
}

.modal-footer button {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
}

.cancel-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
</style>
