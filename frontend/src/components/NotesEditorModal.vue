<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { X } from '@lucide/vue'
import { useAppShell } from '@/composables/useAppShell'
import { renderMarkdown } from '@/utils/markdown'

// Markdown editor for a task's notes, opened from TaskFormModal. Saving
// only hands the text back to the form's draft - nothing is persisted until
// the task form itself is saved, so its Cancel still discards notes too.
const props = defineProps({
  initialText: { type: String, default: '' },
  // true: an in-flow panel sitting beside the task form (the parent's
  // overlay lays the two out side by side). false: there isn't room for
  // that, so it stacks on top of the form with its own backdrop instead -
  // full-screen on a phone.
  docked: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'cancel'])

const { isNarrowViewport } = useAppShell()

const text = ref(props.initialText)
const mode = ref('write') // 'write' | 'preview'
const textareaEl = ref(null)

const rendered = computed(() => renderMarkdown(text.value))
const changed = computed(() => text.value !== props.initialText)

// Escape is a two-press arm/confirm once there are unsaved edits, so one
// stray keypress can't throw away a long note.
const discardArmed = ref(false)

function focusTextarea() {
  // Same reasoning as TaskFormModal's autofocus - on mobile it'd pop the
  // keyboard and shove the layout around before anything's been read.
  if (isNarrowViewport.value) return
  nextTick(() => textareaEl.value?.focus())
}

function setMode(next) {
  mode.value = next
  if (next === 'write') focusTextarea()
}

function toggleMode() {
  setMode(mode.value === 'write' ? 'preview' : 'write')
}

function save() {
  emit('save', text.value)
}

function cancel() {
  emit('cancel')
}

function handleInput() {
  discardArmed.value = false
}

// Capture phase + stopPropagation for the keys handled here, so the task
// form's own document-level handler (Enter saves it, Escape closes it)
// never sees them while this editor is open.
function handleKeydown(event) {
  const mod = event.ctrlKey || event.metaKey
  if (mod && event.key.toLowerCase() === 'e') {
    event.preventDefault()
    event.stopPropagation()
    toggleMode()
    return
  }
  if (mod && event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    save()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (!changed.value || discardArmed.value) cancel()
    else discardArmed.value = true
    return
  }
  // Plain Enter belongs to the textarea (a newline) - just keep it from
  // reaching the task form's Enter-to-save.
  if (event.key === 'Enter') event.stopPropagation()
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown, true)
  focusTextarea()
})
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown, true))
</script>

<template>
  <div class="notes-host" :class="docked ? 'docked' : 'stacked'">
    <div class="notes-panel" role="dialog" aria-label="Edit notes">
      <header class="notes-header">
        <h2>Notes</h2>
        <div class="mode-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'write'"
            :class="{ active: mode === 'write' }"
            @click="setMode('write')"
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'preview'"
            :class="{ active: mode === 'preview' }"
            @click="setMode('preview')"
          >
            Preview
          </button>
        </div>
        <button type="button" class="close-btn" aria-label="Cancel" title="Cancel" @click="cancel"><X :size="20" /></button>
      </header>

      <textarea
        v-show="mode === 'write'"
        ref="textareaEl"
        v-model="text"
        class="notes-textarea"
        placeholder="Write notes in Markdown - **bold**, *italic*, - lists, # headings, [links](https://...)"
        spellcheck="true"
        @input="handleInput"
      ></textarea>
      <div v-show="mode === 'preview'" class="notes-preview-pane">
        <div v-if="text.trim()" class="md-content" v-html="rendered"></div>
        <p v-else class="preview-empty">Nothing to preview.</p>
      </div>

      <footer class="notes-footer">
        <span v-if="discardArmed" class="footer-hint warn">Press Esc again to discard changes</span>
        <span v-else-if="!isNarrowViewport" class="footer-hint">Ctrl+E preview · Ctrl+Enter save</span>
        <div class="spacer"></div>
        <button type="button" class="cancel-btn" @click="cancel">Cancel</button>
        <button type="button" class="save-btn" @click="save">Save</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* --- Docked: in-flow beside the task form ---
   The host's width animates 0 -> panel width on enter/leave (see the
   transition classes below) while the panel keeps its fixed width inside
   it, so the task form glides over to make room instead of jumping. */
.notes-host.docked {
  flex: none;
  width: 34rem;
  margin-left: 1.5rem;
  height: 90vh;
  height: 90dvh;
  overflow: hidden;
}

.notes-host.docked .notes-panel {
  width: 34rem;
  height: 100%;
}

.notes-slide-enter-active,
.notes-slide-leave-active {
  transition:
    width 0.22s ease,
    margin-left 0.22s ease,
    opacity 0.22s ease;
}

.notes-slide-enter-from,
.notes-slide-leave-to {
  width: 0;
  margin-left: 0;
  opacity: 0;
}

/* --- Stacked: on top of the task form, with its own backdrop --- */
.notes-host.stacked {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.45);
}

.notes-host.stacked .notes-panel {
  width: 100%;
  max-width: 40rem;
  height: 90vh;
  height: 90dvh;
}

.notes-fade-enter-active,
.notes-fade-leave-active {
  transition: opacity 0.18s ease;
}

.notes-fade-enter-from,
.notes-fade-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .notes-host.stacked {
    padding: 0;
  }

  .notes-host.stacked .notes-panel {
    max-width: none;
    height: 100vh;
    height: 100dvh;
    border-radius: 0;
    border: none;
    padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
  }
}

/* --- Panel --- */
.notes-panel {
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1.25rem 1.5rem 1.5rem;
}

.notes-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.9rem;
}

.notes-header h2 {
  flex: 1;
  font-size: 1.1rem;
  color: var(--color-heading);
}

.mode-toggle {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.mode-toggle button {
  padding: 0.3rem 0.75rem;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.mode-toggle button + button {
  border-left: 1px solid var(--color-border);
}

.mode-toggle button.active {
  background: #3b82f6;
  color: #fff;
  font-weight: 600;
}

.close-btn {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text);
}

.notes-textarea,
.notes-preview-pane {
  flex: 1;
  min-height: 0;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
}

.notes-textarea {
  width: 100%;
  resize: none;
  padding: 0.6rem 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.55;
}

.notes-preview-pane {
  overflow-y: auto;
  padding: 0.6rem 0.8rem;
  font-size: 0.9rem;
}

.preview-empty {
  opacity: 0.6;
  font-size: 0.85rem;
}

.notes-footer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding-top: 1rem;
}

.footer-hint {
  font-size: 0.75rem;
  color: var(--color-text);
  opacity: 0.55;
}

.footer-hint.warn {
  color: #dc2626;
  opacity: 1;
}

.spacer {
  flex: 1;
}

.notes-footer button {
  padding: 0.45rem 0.9rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
}

.cancel-btn {
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
