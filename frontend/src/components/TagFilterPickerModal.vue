<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { X } from '@lucide/vue'

// Include/Exclude table for the Tags filter. Each tag row has two checkboxes
// and can be in at most one column - ticking one unticks the other. Clicking
// a column header ticks every row in that column (or clears it, if it's
// already full). Nothing ticked = no tag filtering at all.
//
// Included tags combine by `match` ('any' = task has at least one, 'all' =
// task has every one); excluded tags hide a task carrying any one of them.
// Excluding every tag therefore leaves just the untagged tasks.
const props = defineProps({
  tags: { type: Array, default: () => [] },
  included: { type: Array, default: () => [] }, // tag id strings
  excluded: { type: Array, default: () => [] }, // tag id strings
  match: { type: String, default: 'any' }, // 'any' | 'all'
})

// Emits only the keys that changed: { tags?, excludeTags?, tagMatch? }
const emit = defineEmits(['update', 'close'])

const allIds = computed(() => props.tags.map((t) => String(t.id)))
const allIncluded = computed(() => allIds.value.length > 0 && allIds.value.every((id) => props.included.includes(id)))
const allExcluded = computed(() => allIds.value.length > 0 && allIds.value.every((id) => props.excluded.includes(id)))

function toggle(id, column) {
  const idStr = String(id)
  const own = column === 'include' ? props.included : props.excluded
  const other = column === 'include' ? props.excluded : props.included
  const nextOwn = own.includes(idStr) ? own.filter((v) => v !== idStr) : [...own, idStr]
  const nextOther = other.filter((v) => v !== idStr)
  emit(
    'update',
    column === 'include' ? { tags: nextOwn, excludeTags: nextOther } : { tags: nextOther, excludeTags: nextOwn },
  )
}

function toggleColumn(column) {
  if (column === 'include') {
    emit('update', allIncluded.value ? { tags: [] } : { tags: [...allIds.value], excludeTags: [] })
  } else {
    emit('update', allExcluded.value ? { excludeTags: [] } : { excludeTags: [...allIds.value], tags: [] })
  }
}

function setMatch(value) {
  emit('update', { tagMatch: value })
}

function clearAll() {
  emit('update', { tags: [], excludeTags: [] })
}

function handleKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))

let mouseDownOnOverlay = false
function handleOverlayMouseDown(event) {
  mouseDownOnOverlay = event.target === event.currentTarget
}
function handleOverlayClick(event) {
  if (mouseDownOnOverlay && event.target === event.currentTarget) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @mousedown="handleOverlayMouseDown" @click="handleOverlayClick">
      <div class="modal">
        <header class="modal-header">
          <h2>Filter by tags</h2>
          <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
        </header>

        <div class="match-row">
          <span class="match-label">Include tasks with</span>
          <div class="match-toggle">
            <button type="button" :class="{ active: match === 'any' }" @click="setMatch('any')">Any tag</button>
            <button type="button" :class="{ active: match === 'all' }" @click="setMatch('all')">All tags</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="tag-table">
            <thead>
              <tr>
                <th class="col-name">Tag</th>
                <th class="col-check">
                  <button type="button" class="col-header-btn" :class="{ full: allIncluded }" title="Include all / none" @click="toggleColumn('include')">
                    Include
                  </button>
                </th>
                <th class="col-check">
                  <button type="button" class="col-header-btn" :class="{ full: allExcluded }" title="Exclude all / none" @click="toggleColumn('exclude')">
                    Exclude
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in tags" :key="t.id">
                <td class="col-name">
                  <div class="name-cell">
                    <span class="tag-swatch" :style="{ background: t.color || 'var(--line-2)' }"></span>
                    <span class="tag-name">{{ t.name }}</span>
                  </div>
                </td>
                <td class="col-check">
                  <input
                    type="checkbox"
                    :checked="included.includes(String(t.id))"
                    :aria-label="`Include ${t.name}`"
                    @change="toggle(t.id, 'include')"
                  />
                </td>
                <td class="col-check">
                  <input
                    type="checkbox"
                    class="exclude-check"
                    :checked="excluded.includes(String(t.id))"
                    :aria-label="`Exclude ${t.name}`"
                    @change="toggle(t.id, 'exclude')"
                  />
                </td>
              </tr>
              <tr v-if="tags.length === 0">
                <td colspan="3" class="empty">No tags yet.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer class="modal-footer">
          <button type="button" class="clear-btn" @click="clearAll">Clear</button>
          <div class="spacer"></div>
          <button type="button" class="save-btn" @click="emit('close')">Done</button>
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
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  width: 100%;
  max-width: 24rem;
  max-height: 85vh;
  padding: 1.25rem 1.5rem 1.5rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex: none;
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

.match-row {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.match-label {
  font-size: 0.8rem;
  color: var(--color-text);
}

.match-toggle {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.match-toggle button {
  padding: 0.3rem 0.65rem;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.match-toggle button + button {
  border-left: 1px solid var(--color-border);
}

.match-toggle button.active {
  background: var(--accent-tint);
  color: var(--accent);
  font-weight: 600;
}

.table-wrap {
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.tag-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.83rem;
}

.tag-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
  padding: 0.35rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-heading);
  text-align: left;
}

.tag-table td {
  padding: 0.35rem 0.5rem;
  color: var(--color-text);
}

.tag-table tbody tr + tr td {
  border-top: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
}

.tag-table tbody tr:hover td {
  background: var(--color-background-soft);
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tag-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.tag-table .col-check {
  width: 4.75rem;
  text-align: center;
}

.col-header-btn {
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  border: 1px solid transparent;
  background: none;
  color: var(--color-heading);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.col-header-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.col-header-btn.full {
  color: var(--accent);
}

.col-check input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
  cursor: pointer;
  vertical-align: middle;
}

.col-check input.exclude-check {
  accent-color: var(--bad);
}

.tag-swatch {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.empty {
  text-align: center;
  opacity: 0.6;
}

.modal-footer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 1rem;
  flex: none;
}

.spacer {
  flex: 1;
}

.modal-footer button {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  font-family: inherit;
}

.clear-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.save-btn {
  background: #3b82f6;
  border: 1px solid #1d4ed8;
  color: #fff;
}
</style>
