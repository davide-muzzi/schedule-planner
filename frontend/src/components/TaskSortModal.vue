<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { X, ChevronUp, ChevronDown, ArrowDownUp } from '@lucide/vue'
import { SORT_FIELDS, sortField, defaultSortLevels, defaultSortDir, firstInactiveLevelIndex } from '@/utils/taskSort'

// Edits the Tasks board's sort priority list (see utils/taskSort.js).
// Changes apply live, same as TaskFilterModal - Done just closes.
const props = defineProps({
  modelValue: { type: Array, required: true }, // [{ field, dir: 'asc' | 'desc' }]
})

const emit = defineEmits(['update:modelValue', 'close'])

const levels = computed(() => props.modelValue)

function update(next) {
  emit('update:modelValue', next)
}

// Levels below one that applies to every task can never receive a task -
// kept in the list, just greyed out.
const inactiveFrom = computed(() => firstInactiveLevelIndex(levels.value))

const addableFields = computed(() => SORT_FIELDS.filter((f) => !levels.value.some((l) => l.field === f.value)))

const newField = ref('')

function addLevel() {
  if (!newField.value) return
  update([...levels.value, { field: newField.value, dir: defaultSortDir(newField.value) }])
  newField.value = ''
}

// A row's field select: its own field plus any unused one.
function fieldOptionsFor(index) {
  return SORT_FIELDS.filter(
    (f) => f.value === levels.value[index].field || !levels.value.some((l) => l.field === f.value),
  )
}

function changeField(index, value) {
  update(levels.value.map((l, i) => (i === index ? { field: value, dir: defaultSortDir(value) } : l)))
}

function removeLevel(index) {
  update(levels.value.filter((_, i) => i !== index))
}

function toggleDir(index) {
  update(levels.value.map((l, i) => (i === index ? { ...l, dir: l.dir === 'asc' ? 'desc' : 'asc' } : l)))
}

function swapDown(index) {
  if (index < 0 || index >= levels.value.length - 1) return
  const next = [...levels.value]
  ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
  update(next)
}

function reset() {
  update(defaultSortLevels())
}

function handleKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))

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
        <h2>Sort by</h2>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
      </header>

      <ol class="level-list">
        <li
          v-for="(level, i) in levels"
          :key="i"
          class="level-row"
          :class="{ inactive: i >= inactiveFrom }"
          :title="i >= inactiveFrom ? 'Inactive - a level above already applies to every task' : undefined"
        >
          <span class="level-num">{{ i + 1 }}</span>
          <div class="level-main">
            <select class="level-field" :value="level.field" @change="changeField(i, $event.target.value)">
              <option v-for="f in fieldOptionsFor(i)" :key="f.value" :value="f.value">{{ f.label }}</option>
            </select>
            <button
              type="button"
              class="level-dir"
              :title="`Switch to ${sortField(level.field).dirLabels[level.dir === 'asc' ? 'desc' : 'asc'].toLowerCase()}`"
              @click="toggleDir(i)"
            >
              <ArrowDownUp :size="11" /> {{ sortField(level.field).dirLabels[level.dir] }}
            </button>
          </div>
          <button
            type="button"
            class="row-btn"
            title="Move up"
            aria-label="Move up"
            :disabled="i === 0"
            @click="swapDown(i - 1)"
          >
            <ChevronUp :size="14" />
          </button>
          <button
            type="button"
            class="row-btn"
            title="Move down"
            aria-label="Move down"
            :disabled="i === levels.length - 1"
            @click="swapDown(i)"
          >
            <ChevronDown :size="14" />
          </button>
          <button
            type="button"
            class="row-btn"
            title="Remove"
            aria-label="Remove"
            :disabled="levels.length === 1"
            @click="removeLevel(i)"
          >
            <X :size="14" />
          </button>
        </li>
      </ol>

      <div v-if="addableFields.length > 0" class="add-row">
        <select v-model="newField" @change="addLevel">
          <option value="" disabled>+ Add level…</option>
          <option v-for="f in addableFields" :key="f.value" :value="f.value">{{ f.label }}</option>
        </select>
      </div>

      <footer class="modal-footer">
        <button type="button" class="clear-btn" @click="reset">Reset to default</button>
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
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  width: 100%;
  max-width: 24rem;
  max-height: 90vh;
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
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text);
}

.level-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.level-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.level-row.inactive .level-num,
.level-row.inactive .level-main {
  opacity: 0.4;
}

.level-num {
  flex: none;
  width: 1.1rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text);
  opacity: 0.55;
  text-align: center;
}

.level-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  padding: 0.3rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
}

.level-field {
  max-width: 100%;
  padding: 0;
  border: none;
  background: var(--color-background-soft);
  color: var(--color-heading);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.level-dir {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-family: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.level-dir:hover {
  text-decoration: underline;
}

.row-btn {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.row-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.row-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.add-row select {
  width: 100%;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px dashed var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}

.modal-footer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 1rem;
}

.spacer {
  flex: 1;
}

.modal-footer button {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
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
