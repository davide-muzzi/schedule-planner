<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
import { NO_TAGS_SENTINEL } from '@/utils/taskFilters'

// Scrollable tag picker for the Tags filter category - "All" (no
// restriction), "None" (tasks with zero tags), or any number of real tags
// (AND'd together). Mutually exclusive: picking All or None replaces
// whatever else was selected, and picking a real tag drops None (it can't
// coexist with "has this tag").
const props = defineProps({
  tags: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] }, // [] = All, [NO_TAGS_SENTINEL] = None, else tag id strings
})

const emit = defineEmits(['update:modelValue', 'close'])

function isAllActive() {
  return props.modelValue.length === 0
}
function isNoneActive() {
  return props.modelValue.length === 1 && props.modelValue[0] === NO_TAGS_SENTINEL
}
function isTagActive(id) {
  return props.modelValue.includes(String(id))
}

function selectAll() {
  emit('update:modelValue', [])
}
function selectNone() {
  emit('update:modelValue', [NO_TAGS_SENTINEL])
}
function toggleTag(id) {
  const idStr = String(id)
  const current = isNoneActive() ? [] : props.modelValue
  const next = current.includes(idStr) ? current.filter((v) => v !== idStr) : [...current, idStr]
  emit('update:modelValue', next)
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

        <ul class="picker-list">
          <li>
            <button type="button" class="picker-option" :class="{ selected: isAllActive() }" @click="selectAll">
              <span class="picker-name">All</span>
            </button>
          </li>
          <li>
            <button type="button" class="picker-option" :class="{ selected: isNoneActive() }" @click="selectNone">
              <span class="picker-name">None <span class="picker-hint">(no tags at all)</span></span>
            </button>
          </li>
          <li v-if="tags.length > 0" class="picker-divider"></li>
          <li v-for="t in tags" :key="t.id">
            <label class="picker-option" :class="{ selected: isTagActive(t.id) }">
              <input type="checkbox" :checked="isTagActive(t.id)" @change="toggleTag(t.id)" />
              <span class="tag-swatch" :style="{ background: t.color || 'var(--line-2)' }"></span>
              <span class="picker-name">{{ t.name }}</span>
            </label>
          </li>
        </ul>

        <footer class="modal-footer">
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
  max-width: 22rem;
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

.picker-list {
  list-style: none;
  padding: 0;
  margin: 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.picker-divider {
  height: 1px;
  background: var(--color-border);
  margin: 0.4rem 0;
  list-style: none;
}

.picker-option {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.83rem;
  text-align: left;
  cursor: pointer;
}

.picker-option:hover {
  background: var(--color-background-soft);
}

.picker-option.selected {
  background: var(--accent-tint);
  color: var(--color-heading);
  font-weight: 600;
}

.picker-option input[type='checkbox'] {
  flex: none;
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
  cursor: pointer;
}

.picker-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
}

.picker-hint {
  font-weight: normal;
  opacity: 0.6;
}

.tag-swatch {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
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

.save-btn {
  background: #3b82f6;
  border: 1px solid #1d4ed8;
  color: #fff;
}
</style>
