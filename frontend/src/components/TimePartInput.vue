<script setup>
import { ref, nextTick, onBeforeUnmount } from 'vue'
import { Pencil } from '@lucide/vue'
import { useAppShell } from '@/composables/useAppShell'

const props = defineProps({
  modelValue: { type: String, required: true },
  options: { type: Array, required: true }, // quick-pick list, shown in full, never filtered
  max: { type: Number, required: true }, // clamp ceiling for freely-typed values
})

const emit = defineEmits(['update:modelValue'])

const { isNarrowViewport } = useAppShell()

const inputEl = ref(null)
const showDropdown = ref(false)
// On mobile the field is normally readonly (see the template) so tapping it
// opens the dropdown without popping the OS keyboard - this flips it
// editable for one round-trip after picking "Custom", then reverts on blur.
const customEditing = ref(false)
let skipBlurFormat = false

// The dropdown is teleported to <body> and positioned fixed, rather than
// living in normal flow under the input. In-flow, it used to physically
// overlap whatever field sat below it in the form (its 12rem max-height
// reaches well past a single input) - close enough that mousing down
// through the option list could graze a sibling control underneath and
// flash its :hover state, since the browser hands hover to whatever's
// topmost at the cursor once it strays outside the dropdown's own box.
const dropdownPosition = ref({ top: 0, left: 0, width: 0, maxHeight: 192 })

function updateDropdownPosition() {
  const el = inputEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const gap = 4
  const margin = 8
  const preferredMax = 192 // 12rem, same cap the dropdown always had
  const spaceBelow = window.innerHeight - rect.bottom - gap - margin
  const spaceAbove = rect.top - gap - margin
  const openUp = spaceBelow < 120 && spaceAbove > spaceBelow
  const maxHeight = Math.round(Math.max(80, Math.min(preferredMax, openUp ? spaceAbove : spaceBelow)))
  dropdownPosition.value = {
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    top: Math.round(openUp ? rect.top - gap - maxHeight : rect.bottom + gap),
    maxHeight,
  }
}

function handleViewportChange() {
  if (showDropdown.value) updateDropdownPosition()
}

window.addEventListener('resize', handleViewportChange)
window.addEventListener('scroll', handleViewportChange, true)
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})

function openDropdown(event) {
  showDropdown.value = true
  updateDropdownPosition()
  if (isNarrowViewport.value) {
    // Selecting-all pops the mobile keyboard straight into "replace" mode,
    // which reads as the field being mysteriously pre-highlighted - just
    // park the caret at the end instead, same as a normal tap would. Has to
    // wait a tick: the tap that triggers this focus also carries its own
    // native "place caret where I tapped" behavior, which runs after focus
    // and would otherwise immediately override this.
    const target = event.target
    setTimeout(() => {
      const length = target.value.length
      target.setSelectionRange(length, length)
    }, 0)
  } else {
    event.target.select() // typing immediately overwrites, no manual clearing needed
  }
}

function handleInput(event) {
  emit('update:modelValue', event.target.value)
}

function handleBlur(event) {
  showDropdown.value = false
  customEditing.value = false
  if (skipBlurFormat) {
    // value was just set via selectOption and is already valid — the DOM's
    // event.target.value hasn't caught up to it yet, so re-parsing it here
    // would overwrite the selection with the stale pre-click value
    skipBlurFormat = false
    return
  }
  const num = parseInt(event.target.value, 10)
  const clamped = Number.isNaN(num) ? 0 : Math.min(props.max, Math.max(0, num))
  emit('update:modelValue', String(clamped).padStart(2, '0'))
}

function selectOption(option) {
  emit('update:modelValue', option)
  showDropdown.value = false
  skipBlurFormat = true
  inputEl.value?.blur()
}

function enableCustomEdit() {
  showDropdown.value = false
  customEditing.value = true
  nextTick(() => {
    inputEl.value?.focus()
    inputEl.value?.select()
  })
}
</script>

<template>
  <div class="time-part">
    <input
      ref="inputEl"
      :value="modelValue"
      inputmode="numeric"
      maxlength="2"
      :readonly="isNarrowViewport && !customEditing"
      @focus="openDropdown"
      @input="handleInput"
      @blur="handleBlur"
      @keydown.escape.stop="showDropdown = false"
    />
  </div>

  <Teleport to="body">
    <div
      v-if="showDropdown"
      class="time-part-dropdown"
      :style="{
        top: dropdownPosition.top + 'px',
        left: dropdownPosition.left + 'px',
        width: dropdownPosition.width + 'px',
        maxHeight: dropdownPosition.maxHeight + 'px',
      }"
    >
      <button
        v-for="option in options"
        :key="option"
        type="button"
        class="time-part-option"
        @mousedown.prevent="selectOption(option)"
      >
        {{ option }}
      </button>
      <button
        v-if="isNarrowViewport"
        type="button"
        class="time-part-option time-part-option-custom"
        aria-label="Enter a custom value"
        title="Enter a custom value"
        @mousedown.prevent="enableCustomEdit"
      >
        <Pencil :size="13" />
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.time-part {
  position: relative;
}

.time-part input {
  width: 3.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.9rem;
  font-family: inherit;
  text-align: center;
}

.time-part-dropdown {
  position: fixed;
  z-index: 60;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.time-part-dropdown::-webkit-scrollbar {
  width: 6px;
}

.time-part-dropdown::-webkit-scrollbar-track {
  background: transparent;
}

.time-part-dropdown::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.time-part-option {
  flex-shrink: 0;
  padding: 0.3rem 0.6rem;
  background: transparent;
  border: none;
  color: var(--color-text);
  font-size: 0.85rem;
  text-align: center;
  cursor: pointer;
  font-family: inherit;
}

.time-part-option:hover {
  background: var(--color-background-soft);
}

.time-part-option-custom {
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid var(--color-border);
  color: var(--color-heading);
}
</style>
