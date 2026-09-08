<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { X } from '@lucide/vue'

// Generic multi-category filter popup - each category (status, priority,
// etc.) is single-select with an "All" option meaning that category imposes
// no restriction, UNLESS it sets `multiSelect: true` (currently just tags),
// in which case its value is an array of selected option values instead of
// a single one, "All" means the array is empty, and the caller applying the
// filter treats multiple selections as AND (must match every one), not OR -
// see TasksView's matchesFilters. Categories are data-driven so a new one is
// just another entry in the caller's list, not a new component.
const props = defineProps({
  categories: { type: Array, required: true }, // [{ key, label, multiSelect?, options: [{ value, label }] }]
  modelValue: { type: Object, required: true }, // { [categoryKey]: selectedValue | selectedValue[] }
})

const emit = defineEmits(['update:modelValue', 'close'])

function isActive(category, option) {
  const current = props.modelValue[category.key]
  if (!category.multiSelect) return current === option.value
  if (option.value === 'all') return !Array.isArray(current) || current.length === 0
  return Array.isArray(current) && current.includes(option.value)
}

function select(category, value) {
  if (!category.multiSelect) {
    emit('update:modelValue', { ...props.modelValue, [category.key]: value })
    return
  }
  const current = Array.isArray(props.modelValue[category.key]) ? props.modelValue[category.key] : []
  const next = value === 'all' ? [] : current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  emit('update:modelValue', { ...props.modelValue, [category.key]: next })
}

function clearAll() {
  emit(
    'update:modelValue',
    Object.fromEntries(props.categories.map((c) => [c.key, c.multiSelect ? [] : 'all'])),
  )
}

function handleKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))

// Same "mousedown started on the bare overlay" guard as the other modals, so
// a text-selection drag that releases past the modal's edge doesn't close it.
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
        <h2>Filters</h2>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
      </header>

      <div class="category" v-for="category in categories" :key="category.key">
        <p class="category-label">{{ category.label }}</p>
        <div class="pill-row">
          <button
            v-for="option in category.options"
            :key="option.value"
            type="button"
            class="pill"
            :class="{ active: isActive(category, option) }"
            @click="select(category, option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <footer class="modal-footer">
        <button type="button" class="clear-btn" @click="clearAll">Clear all</button>
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
  max-width: 22rem;
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

.category {
  margin-bottom: 1rem;
}

.category-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-heading);
  margin-bottom: 0.4rem;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.pill {
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s,
    background-color 0.16s;
}

.pill:hover {
  color: var(--color-heading);
  border-color: var(--accent);
}

.pill.active {
  background: var(--accent-tint);
  border-color: var(--accent);
  color: var(--accent);
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
