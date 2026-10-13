<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { X } from '@lucide/vue'
import { durationHours, formatHours } from '@/utils/date'
import { colorStyleForType } from '@/utils/entryTypeColors'

const props = defineProps({
  date: { type: Date, required: true },
  entries: { type: Array, required: true },
  tasks: { type: Array, default: () => [] },
  entryTypeColors: { type: Object, required: true },
})

const emit = defineEmits(['close'])

const taskById = computed(() => Object.fromEntries(props.tasks.map((t) => [t.id, t])))

const dateLabel = computed(() =>
  props.date.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
)

// "OvertimeCompensation" -> "Overtime Compensation"
function formatEntryTypeLabel(type) {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2')
}

// Entries linked to the same task are one group regardless of their titles;
// everything else groups by title + entry type, so a "Meeting" Working entry
// and a "Meeting" Appointment stay apart.
const groups = computed(() => {
  const byKey = new Map()
  for (const entry of props.entries) {
    const task = taskById.value[entry.taskItemId]
    const key = task ? `task:${task.id}` : `entry:${entry.entryType}:${entry.title ?? ''}`
    let group = byKey.get(key)
    if (!group) {
      group = {
        key,
        label: task?.name ?? entry.title ?? formatEntryTypeLabel(entry.entryType),
        typeLabel: formatEntryTypeLabel(entry.entryType),
        color: task?.color || colorStyleForType(entry.entryType, props.entryTypeColors).bg,
        hours: 0,
        allDay: false,
        count: 0,
      }
      byKey.set(key, group)
    }
    group.count++
    if (entry.allDay) group.allDay = true
    else group.hours += durationHours(entry.startTime, entry.endTime)
  }
  // All-day groups first (they span the whole day), then longest first.
  return [...byKey.values()].sort((a, b) => b.allDay - a.allDay || b.hours - a.hours)
})

const workedHours = computed(() =>
  props.entries
    .filter((e) => e.entryType === 'Working' && !e.allDay)
    .reduce((sum, e) => sum + durationHours(e.startTime, e.endTime), 0),
)

function handleKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))

// Same fix as EntryFormModal - a text-selection drag that releases past the
// modal's edge shouldn't count as a click on the backdrop.
const overlayMouseDownOnSelf = ref(false)

function handleOverlayMouseDown(event) {
  overlayMouseDownOnSelf.value = event.target === event.currentTarget
}

function handleOverlayClick(event) {
  if (overlayMouseDownOnSelf.value && event.target === event.currentTarget) emit('close')
}
</script>

<template>
  <Teleport to="body">
  <div class="overlay" @mousedown="handleOverlayMouseDown" @click="handleOverlayClick">
    <div class="modal">
      <header class="modal-header">
        <h2>{{ dateLabel }}</h2>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
      </header>

      <p v-if="groups.length === 0" class="empty-state">No entries on this day.</p>

      <table v-else class="entries-table">
        <thead>
          <tr>
            <th>Entry</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="group in groups" :key="group.key">
            <td>
              <span class="entry-label" :style="{ color: group.color }">{{ group.label }}</span>
              <span class="entry-meta">{{ group.typeLabel }}<template v-if="group.count > 1"> · {{ group.count }}×</template></span>
            </td>
            <td :style="{ color: group.color }">{{ group.allDay ? 'All Day' : formatHours(group.hours) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="totals-row">
            <td>Total worked</td>
            <td>{{ formatHours(workedHours) }}</td>
          </tr>
        </tfoot>
      </table>

      <footer class="modal-footer">
        <button type="button" class="cancel-btn" @click="emit('close')">Close</button>
      </footer>
    </div>
  </div>
  </Teleport>
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
  max-width: 36rem;
  max-height: 85vh;
  overflow-y: auto;
  padding: 1.25rem 1.75rem 1.5rem;
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
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text);
}

.empty-state {
  font-size: 0.85rem;
  opacity: 0.7;
  padding: 1rem 0;
}

.entries-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.entries-table th {
  text-align: left;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-heading);
  opacity: 0.7;
  padding: 0 1px 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.entries-table th:not(:first-child),
.entries-table td:not(:first-child) {
  text-align: right;
  white-space: nowrap;
}

.entries-table td {
  padding: 0.5rem 1px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  font-weight: 600;
}

.entry-label {
  margin-right: 0.5rem;
}

.entry-meta {
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--color-text);
  opacity: 0.6;
  white-space: nowrap;
}

.entries-table tbody tr:last-child td {
  border-bottom: none;
}

.totals-row td {
  padding-top: 0.75rem;
  border-top: 2px solid var(--color-border);
  border-bottom: none;
  font-weight: 700;
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

@media (max-width: 900px) {
  .modal {
    max-width: 28rem;
    padding: 1.25rem 1.5rem 1.5rem;
  }
}
</style>
