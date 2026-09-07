<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { X } from '@lucide/vue'

// For a decision with more than a plain yes/no (e.g. deleting a Group:
// cancel / unlink subtasks / delete subtasks too) - see ConfirmDialog.vue
// for the simpler binary confirm/cancel case used elsewhere in the app.
// Every choice other than Cancel is passed back via @choose(value); Cancel
// is just @close with nothing chosen.
const props = defineProps({
  title: { type: String, required: true },
  message: { type: String, required: true },
  actions: { type: Array, required: true }, // [{ value, label, variant? }]
})

const emit = defineEmits(['choose', 'close'])

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
        <h2>{{ title }}</h2>
        <button type="button" class="close-btn" @click="emit('close')" aria-label="Close"><X :size="20" /></button>
      </header>

      <p class="message">{{ message }}</p>

      <footer class="modal-footer">
        <button type="button" class="cancel-btn" @click="emit('close')">Cancel</button>
        <div class="spacer"></div>
        <button
          v-for="action in actions"
          :key="action.value"
          type="button"
          class="action-btn"
          :class="action.variant || 'default'"
          @click="emit('choose', action.value)"
        >
          {{ action.label }}
        </button>
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
  max-width: 24rem;
  padding: 1.25rem 1.5rem 1.5rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
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
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1.25rem;
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

.cancel-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.action-btn.default {
  background: #3b82f6;
  border: 1px solid #1d4ed8;
  color: #fff;
}

.action-btn.danger {
  background: transparent;
  border: 1px solid #dc2626;
  color: #dc2626;
}
</style>
