<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  title: { type: String, default: 'Are you sure?' },
  message: { type: String, required: true },
  confirmLabel: { type: String, default: 'Confirm' },
  cancelLabel: { type: String, default: 'Cancel' },
  danger: { type: Boolean, default: false }, // styles the confirm button as destructive
  // When set, the confirm button stays disabled until the user types this
  // word (case-insensitive) into the field below - an extra speed bump for
  // actions that are both destructive and bulk (can't be undone via a
  // toast, unlike a single delete/clear-day).
  requireTypedWord: { type: String, default: null },
})

const emit = defineEmits(['confirm', 'cancel'])

const typedValue = ref('')
const typedInputEl = ref(null)

const canConfirm = computed(
  () => !props.requireTypedWord || typedValue.value.trim().toLowerCase() === props.requireTypedWord.toLowerCase(),
)

function handleConfirm() {
  if (!canConfirm.value) return
  emit('confirm')
}

function handleKeydown(event) {
  if (event.key === 'Escape') emit('cancel')
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  typedInputEl.value?.focus()
})
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
        <h2 class="title">{{ title }}</h2>
        <p class="message">{{ message }}</p>

        <div v-if="requireTypedWord" class="typed-confirm">
          <label :for="'confirm-typed-input'">
            Type <strong>"{{ requireTypedWord }}"</strong> to proceed
          </label>
          <input
            id="confirm-typed-input"
            ref="typedInputEl"
            v-model="typedValue"
            type="text"
            autocomplete="off"
            @keydown.enter="handleConfirm"
          />
        </div>

        <footer class="modal-footer">
          <button type="button" class="cancel-btn" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button
            type="button"
            class="confirm-btn"
            :class="{ danger }"
            :disabled="!canConfirm"
            @click="handleConfirm"
          >
            {{ confirmLabel }}
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

.title {
  font-size: 1.05rem;
  color: var(--color-heading);
  margin-bottom: 0.6rem;
}

.message {
  font-size: 0.85rem;
  color: var(--color-text);
  opacity: 0.85;
  line-height: 1.5;
  white-space: pre-line;
}

.typed-confirm {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 1rem;
}

.typed-confirm label {
  font-size: 0.8rem;
  color: var(--color-text);
  opacity: 0.85;
}

.typed-confirm input {
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
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

.confirm-btn {
  background: #3b82f6;
  border: 1px solid #1d4ed8;
  color: #fff;
}

.confirm-btn.danger {
  background: #dc2626;
  border: 1px solid #b91c1c;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
