<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { X } from '@lucide/vue'

// Shown instead of a plain delete when the entry being deleted is the last
// one linked to its task - deleting it outright would silently leave the
// task orphaned (which is fine and already how a task can exist unlinked),
// but the user might actually want the task gone too rather than sitting
// around at Backlog forever.
defineProps({
  taskName: { type: String, required: true },
})

const emit = defineEmits(['unlink', 'delete', 'cancel'])

function handleKeydown(event) {
  if (event.key === 'Escape') emit('cancel')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))

// Same text-selection-drag guard as the other modals in this app.
const overlayMouseDownOnSelf = ref(false)

function handleOverlayMouseDown(event) {
  overlayMouseDownOnSelf.value = event.target === event.currentTarget
}

function handleOverlayClick(event) {
  if (overlayMouseDownOnSelf.value && event.target === event.currentTarget) emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @mousedown="handleOverlayMouseDown" @click="handleOverlayClick">
      <div class="modal">
        <header class="modal-header">
          <h2>Delete this entry?</h2>
          <button type="button" class="close-btn" @click="emit('cancel')" aria-label="Cancel"><X :size="20" /></button>
        </header>

        <p class="message">
          This is the only planner entry linked to <strong>"{{ taskName }}"</strong>. What should happen to the task?
        </p>

        <footer class="modal-footer">
          <button type="button" class="cancel-btn" @click="emit('cancel')">Cancel</button>
          <button type="button" class="unlink-btn" @click="emit('unlink')">Unlink</button>
          <button type="button" class="delete-btn" @click="emit('delete')">Delete task too</button>
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
  z-index: 200;
  padding: 1rem;
}

.modal {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  width: 100%;
  max-width: 26rem;
  padding: 1.25rem 1.5rem 1.5rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

.modal-header h2 {
  font-size: 1.05rem;
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

.message {
  font-size: 0.85rem;
  color: var(--color-text);
  opacity: 0.85;
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1.25rem;
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

.unlink-btn {
  background: #3b82f6;
  border: 1px solid #1d4ed8;
  color: #fff;
}

.delete-btn {
  background: #dc2626;
  border: 1px solid #b91c1c;
  color: #fff;
}
</style>
