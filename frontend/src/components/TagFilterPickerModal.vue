<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { X } from '@lucide/vue'
import { NO_TAGS_SENTINEL } from '@/utils/taskFilters'

// Scrollable tag picker for the Tags filter categories.
//
// Include mode: "All" (no restriction), "None" (tasks with zero tags), or any
// number of real tags (AND'd together). Mutually exclusive: picking All or
// None replaces whatever else was selected, and picking a real tag drops
// None (it can't coexist with "has this tag").
//
// Exclude mode: "Nothing excluded", or any mix of real tags plus "Untagged
// tasks" - a task carrying any one of them is hidden.
//
// Anything selected in the other mode's filter (otherSelection) is disabled
// here, so a tag can't be included and excluded at the same time.
const props = defineProps({
  tags: { type: Array, default: () => [] },
  mode: { type: String, default: 'include' }, // 'include' | 'exclude'
  modelValue: { type: Array, default: () => [] }, // [] = All/nothing, NO_TAGS_SENTINEL = untagged, else tag id strings
  otherSelection: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'close'])

const isExclude = computed(() => props.mode === 'exclude')

function isAllActive() {
  return props.modelValue.length === 0
}
function isNoneActive() {
  return props.modelValue.includes(NO_TAGS_SENTINEL)
}
function isTagActive(id) {
  return props.modelValue.includes(String(id))
}
function isBlocked(value) {
  return props.otherSelection.includes(String(value))
}

function selectAll() {
  emit('update:modelValue', [])
}
function selectNone() {
  if (isBlocked(NO_TAGS_SENTINEL)) return
  if (!isExclude.value) {
    emit('update:modelValue', [NO_TAGS_SENTINEL])
    return
  }
  toggleValue(NO_TAGS_SENTINEL, props.modelValue)
}
function toggleTag(id) {
  if (isBlocked(id)) return
  const current = !isExclude.value && isNoneActive() ? [] : props.modelValue
  toggleValue(String(id), current)
}
function toggleValue(value, current) {
  emit('update:modelValue', current.includes(value) ? current.filter((v) => v !== value) : [...current, value])
}

function blockedHint() {
  return isExclude.value ? '(included)' : '(excluded)'
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
          <h2>{{ isExclude ? 'Exclude tags' : 'Include tags' }}</h2>
          <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
        </header>

        <ul class="picker-list">
          <li>
            <button type="button" class="picker-option" :class="{ selected: isAllActive() }" @click="selectAll">
              <span class="picker-name">{{ isExclude ? 'Nothing excluded' : 'All' }}</span>
            </button>
          </li>
          <li v-if="!isExclude">
            <button
              type="button"
              class="picker-option"
              :class="{ selected: isNoneActive(), blocked: isBlocked(NO_TAGS_SENTINEL) }"
              :disabled="isBlocked(NO_TAGS_SENTINEL)"
              @click="selectNone"
            >
              <span class="picker-name">
                None <span class="picker-hint">{{ isBlocked(NO_TAGS_SENTINEL) ? blockedHint() : '(no tags at all)' }}</span>
              </span>
            </button>
          </li>
          <li v-else>
            <label class="picker-option" :class="{ selected: isNoneActive(), blocked: isBlocked(NO_TAGS_SENTINEL) }">
              <input
                type="checkbox"
                :checked="isNoneActive()"
                :disabled="isBlocked(NO_TAGS_SENTINEL)"
                @change="selectNone"
              />
              <span class="picker-name">
                Untagged tasks
                <span v-if="isBlocked(NO_TAGS_SENTINEL)" class="picker-hint">{{ blockedHint() }}</span>
              </span>
            </label>
          </li>
          <li v-if="tags.length > 0" class="picker-divider"></li>
          <li v-for="t in tags" :key="t.id">
            <label class="picker-option" :class="{ selected: isTagActive(t.id), blocked: isBlocked(t.id) }">
              <input type="checkbox" :checked="isTagActive(t.id)" :disabled="isBlocked(t.id)" @change="toggleTag(t.id)" />
              <span class="tag-swatch" :style="{ background: t.color || 'var(--line-2)' }"></span>
              <span class="picker-name">
                {{ t.name }} <span v-if="isBlocked(t.id)" class="picker-hint">{{ blockedHint() }}</span>
              </span>
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

.picker-option.blocked {
  opacity: 0.45;
  cursor: not-allowed;
}

.picker-option.blocked:hover {
  background: transparent;
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
