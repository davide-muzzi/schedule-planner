<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, required: true },
  options: { type: Array, required: true }, // quick-pick list, shown in full, never filtered
  max: { type: Number, required: true }, // clamp ceiling for freely-typed values
})

const emit = defineEmits(['update:modelValue'])

const inputEl = ref(null)
const showDropdown = ref(false)

function openDropdown(event) {
  showDropdown.value = true
  event.target.select() // typing immediately overwrites, no manual clearing needed
}

function handleInput(event) {
  emit('update:modelValue', event.target.value)
}

function handleBlur(event) {
  showDropdown.value = false
  const num = parseInt(event.target.value, 10)
  const clamped = Number.isNaN(num) ? 0 : Math.min(props.max, Math.max(0, num))
  emit('update:modelValue', String(clamped).padStart(2, '0'))
}

function selectOption(option) {
  emit('update:modelValue', option)
  showDropdown.value = false
  inputEl.value?.blur()
}
</script>

<template>
  <div class="time-part">
    <input
      ref="inputEl"
      :value="modelValue"
      inputmode="numeric"
      maxlength="2"
      @focus="openDropdown"
      @input="handleInput"
      @blur="handleBlur"
      @keydown.escape.stop="showDropdown = false"
    />
    <div v-if="showDropdown" class="time-part-dropdown">
      <button
        v-for="option in options"
        :key="option"
        type="button"
        class="time-part-option"
        @mousedown.prevent="selectOption(option)"
      >
        {{ option }}
      </button>
    </div>
  </div>
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
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  z-index: 20;
  max-height: 12rem;
  overflow-y: auto;
  min-width: 3.5rem;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.time-part-option {
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
</style>
