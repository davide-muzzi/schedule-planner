<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { X, Plus, Pencil, Check } from '@lucide/vue'
import { useTagsStore } from '@/stores/tagsStore'
import { useTasksStore } from '@/stores/tasksStore'

const tagsStore = useTagsStore()
const tasksStore = useTasksStore()
const emit = defineEmits(['close'])

// How many tasks currently carry this tag - shown so it's clear what
// deleting a tag would affect before doing it.
function usageCount(tagId) {
  return tasksStore.tasks.filter((t) => (t.tags || []).some((tag) => tag.id === tagId)).length
}

const DEFAULT_COLOR = '#3b82f6'

const newTagName = ref('')
const newTagColor = ref(DEFAULT_COLOR)
const createError = ref(null)
const creating = ref(false)

const editingId = ref(null)
const editName = ref('')
const editColor = ref(DEFAULT_COLOR)
const editError = ref(null)
const saving = ref(false)

// Delete is a two-click arm/confirm rather than a full dialog - a tag has
// no undo toast (unlike a task), so this is the speed bump instead.
const deleteArmedId = ref(null)

async function handleCreate() {
  if (!newTagName.value.trim()) return
  creating.value = true
  createError.value = null
  try {
    await tagsStore.createTag({ name: newTagName.value.trim(), color: newTagColor.value })
    newTagName.value = ''
    newTagColor.value = DEFAULT_COLOR
  } catch {
    createError.value = tagsStore.error
  } finally {
    creating.value = false
  }
}

function startEdit(tag) {
  deleteArmedId.value = null
  editingId.value = tag.id
  editName.value = tag.name
  editColor.value = tag.color || DEFAULT_COLOR
  editError.value = null
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(tag) {
  if (!editName.value.trim()) return
  saving.value = true
  editError.value = null
  try {
    await tagsStore.updateTag(tag.id, { name: editName.value.trim(), color: editColor.value })
    editingId.value = null
  } catch {
    editError.value = tagsStore.error
  } finally {
    saving.value = false
  }
}

function handleDeleteClick(tag) {
  if (deleteArmedId.value === tag.id) {
    tagsStore.deleteTag(tag.id)
    deleteArmedId.value = null
  } else {
    deleteArmedId.value = tag.id
  }
}

function handleKeydown(event) {
  if (event.key !== 'Escape') return
  if (editingId.value !== null) {
    cancelEdit()
    return
  }
  emit('close')
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
        <h2>Manage tags</h2>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
      </header>

      <ul v-if="tagsStore.tags.length > 0" class="tag-list">
        <li v-for="tag in tagsStore.tags" :key="tag.id" class="tag-row">
          <template v-if="editingId === tag.id">
            <input v-model="editColor" type="color" class="color-input" />
            <input
              v-model="editName"
              type="text"
              class="tag-name-input"
              @keydown.enter="saveEdit(tag)"
              @keydown.escape.stop="cancelEdit"
            />
            <button type="button" class="row-btn confirm" title="Save" aria-label="Save" :disabled="saving" @click="saveEdit(tag)">
              <Check :size="14" />
            </button>
            <button type="button" class="row-btn" title="Cancel" aria-label="Cancel" @click="cancelEdit">
              <X :size="14" />
            </button>
          </template>
          <template v-else>
            <span class="tag-swatch" :style="{ background: tag.color || 'var(--color-border)' }"></span>
            <span class="tag-name">{{ tag.name }}</span>
            <span class="tag-usage-count">{{ usageCount(tag.id) }} task{{ usageCount(tag.id) === 1 ? '' : 's' }}</span>
            <button type="button" class="row-btn" title="Rename" aria-label="Rename" @click="startEdit(tag)">
              <Pencil :size="13" />
            </button>
            <button
              type="button"
              class="row-btn"
              :class="{ danger: deleteArmedId === tag.id }"
              :title="deleteArmedId === tag.id ? 'Click again to confirm delete' : 'Delete'"
              :aria-label="deleteArmedId === tag.id ? 'Click again to confirm delete' : 'Delete'"
              @click="handleDeleteClick(tag)"
            >
              <X :size="14" />
            </button>
          </template>
        </li>
      </ul>
      <p v-else class="empty-state">No tags yet.</p>

      <p v-if="editError" class="error-msg">{{ editError }}</p>

      <form class="create-row" @submit.prevent="handleCreate">
        <input v-model="newTagColor" type="color" class="color-input" />
        <input v-model="newTagName" type="text" class="tag-name-input" placeholder="New tag name" />
        <button type="submit" class="row-btn confirm" title="Add tag" aria-label="Add tag" :disabled="creating || !newTagName.trim()">
          <Plus :size="14" />
        </button>
      </form>
      <p v-if="createError" class="error-msg">{{ createError }}</p>

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

.tag-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tag-row,
.create-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.tag-swatch {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--color-text) 20%, transparent);
}

.tag-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.88rem;
  color: var(--color-text);
}

.tag-usage-count {
  flex: none;
  font-size: 0.75rem;
  color: var(--color-text);
  opacity: 0.55;
  white-space: nowrap;
}

.tag-name-input {
  flex: 1;
  min-width: 0;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.85rem;
  font-family: inherit;
}

.color-input {
  flex: none;
  width: 1.6rem;
  height: 1.6rem;
  padding: 1px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  cursor: pointer;
}

.row-btn {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.row-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.row-btn.confirm {
  color: #3b82f6;
}

.row-btn.confirm:disabled {
  opacity: 0.5;
  cursor: default;
  color: var(--color-text);
  border-color: var(--color-border);
}

.row-btn.danger {
  background: #dc2626;
  border-color: #dc2626;
  color: #fff;
}

.create-row {
  padding-top: 0.6rem;
  border-top: 1px solid var(--color-border);
}

.empty-state {
  font-size: 0.85rem;
  color: var(--color-text);
  opacity: 0.6;
  margin-bottom: 0.6rem;
}

.error-msg {
  color: #dc2626;
  font-size: 0.85rem;
  margin: 0.4rem 0;
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

.save-btn {
  background: #3b82f6;
  border: 1px solid #1d4ed8;
  color: #fff;
}
</style>
