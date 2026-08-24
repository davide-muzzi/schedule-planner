<script setup>
import { toastMessage, toastVisible, toastVariant, toastAction, hideToast } from '@/utils/toast'

function handleActionClick() {
  toastAction.value?.onClick?.()
  hideToast()
}
</script>

<template>
  <transition name="toast-fade">
    <div
      v-if="toastVisible"
      class="toast"
      :class="'variant-' + toastVariant"
      :style="{ pointerEvents: toastAction ? 'auto' : 'none' }"
    >
      <span class="toast-message">{{ toastMessage }}</span>
      <button v-if="toastAction" type="button" class="toast-action" @click="handleActionClick">
        {{ toastAction.label }}
      </button>
    </div>
  </transition>
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.toast.variant-error {
  background: color-mix(in srgb, var(--bad) 16%, var(--color-background));
  border: 1px solid var(--bad);
}

.toast.variant-warn {
  background: color-mix(in srgb, var(--warn) 16%, var(--color-background));
  border: 1px solid var(--warn);
}

.toast-message {
  white-space: nowrap;
  font-weight: 600;
}

.toast.variant-error .toast-message {
  color: var(--bad);
}

.toast.variant-warn .toast-message {
  color: var(--warn);
}

.toast-action {
  flex: none;
  background: none;
  border: none;
  color: var(--accent);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.toast-action:hover {
  opacity: 0.8;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
}
</style>
