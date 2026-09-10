<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Plus, SlidersHorizontal, X } from '@lucide/vue'
import { useTagsStore } from '@/stores/tagsStore'
import { formatHours } from '@/utils/date'
import { buildTaskFilterCategories, defaultTaskFilters, taskMatchesFilters } from '@/utils/taskFilters'
import TaskFilterModal from './TaskFilterModal.vue'

// Same search+filter picker TaskFormModal's "Add existing task" (subtask
// picker) uses, just single-select instead of multi - picking a row applies
// it immediately instead of needing a separate Done step.
const props = defineProps({
  tasks: { type: Array, default: () => [] },
  selectedId: { type: Number, default: null },
})

const emit = defineEmits(['close', 'select', 'create-new'])

const tagsStore = useTagsStore()

const search = ref('')
const showFilterModal = ref(false)
const filterCategories = computed(() => buildTaskFilterCategories(tagsStore.tags))
const filters = ref(defaultTaskFilters(filterCategories.value))
const activeFilterCount = computed(
  () =>
    filterCategories.value.filter((c) => {
      const v = filters.value[c.key]
      return c.multiSelect ? Array.isArray(v) && v.length > 0 : (v ?? 'all') !== 'all'
    }).length,
)

// Done tasks are finished work, not something a new link should point at -
// but if this entry is already linked to one (marked Done after the link
// was made), it stays in the list so reopening the picker doesn't show a
// blank/missing selection. Subtasks are never linkable directly - only
// their Group is (the group is what tracks real time).
const eligibleTasks = computed(() =>
  props.tasks.filter((t) => t.parentTaskId == null && (t.status !== 'Done' || t.id === props.selectedId)),
)

const filteredTasks = computed(() =>
  eligibleTasks.value.filter((t) => taskMatchesFilters(t, filters.value, search.value)),
)

function hoursFor(minutes) {
  return formatHours(minutes / 60)
}

function handleKeydown(event) {
  if (showFilterModal.value) return // it has its own Escape handling
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
          <h2>Link a task</h2>
          <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
        </header>

        <div class="picker-toolbar">
          <input v-model="search" type="text" placeholder="Search tasks..." class="picker-search" />
          <button
            type="button"
            class="picker-filter-btn"
            :class="{ active: activeFilterCount > 0 }"
            @click="showFilterModal = true"
          >
            <SlidersHorizontal :size="13" /> Filters<span v-if="activeFilterCount"> ({{ activeFilterCount }})</span>
          </button>
        </div>

        <ul class="picker-list">
          <li v-if="filteredTasks.length === 0" class="picker-empty">No matching tasks.</li>
          <li v-for="t in filteredTasks" :key="t.id">
            <button
              type="button"
              class="picker-option"
              :class="{ selected: t.id === selectedId }"
              @click="emit('select', t.id)"
            >
              <span class="picker-name">#{{ t.id }} - {{ t.name }}</span>
              <span class="picker-minutes">{{ hoursFor(t.estimatedMinutes) }}</span>
            </button>
          </li>
        </ul>

        <footer class="modal-footer">
          <button type="button" class="create-btn" @click="emit('create-new')"><Plus :size="13" /> Create new Task</button>
          <div class="spacer"></div>
          <button type="button" class="cancel-btn" @click="emit('close')">Cancel</button>
        </footer>
      </div>
    </div>

    <TaskFilterModal
      v-if="showFilterModal"
      :categories="filterCategories"
      :model-value="filters"
      @update:model-value="(v) => (filters = v)"
      @close="showFilterModal = false"
    />
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
  /* Same z-index as every other modal here (including the TaskFilterModal
     this one opens on top of itself) - all of them Teleport to <body>, so
     later-mounted siblings already paint above earlier ones at an equal
     z-index. A higher value would fight that ordering and could render
     TaskFilterModal behind this one instead of on top of it. */
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
  max-width: 28rem;
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

.picker-toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex: none;
}

.picker-search {
  flex: 1;
  min-width: 0;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
}

.picker-filter-btn {
  display: flex;
  align-items: center;
  flex: none;
  gap: 0.35rem;
  padding: 0.4rem 0.7rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.picker-filter-btn:hover {
  color: var(--color-heading);
  border-color: var(--accent);
}

.picker-filter-btn.active {
  background: var(--accent-tint);
  border-color: var(--accent);
  color: var(--accent);
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

.picker-empty {
  font-size: 0.8rem;
  color: var(--color-text);
  opacity: 0.6;
  padding: 0.3rem;
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

.picker-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
}

.picker-minutes {
  flex: none;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  opacity: 0.75;
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

.create-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-heading);
  font-weight: 600;
}

.create-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.cancel-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
</style>
