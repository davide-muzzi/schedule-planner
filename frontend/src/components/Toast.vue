<script setup>
import { toastMessage, toastVisible } from '@/utils/toast'
</script>

<template>
  <transition name="toast-fade">
    <div v-if="toastVisible" class="toast">{{ toastMessage }}</div>
  </transition>
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  background: var(--color-background);
  border: 1px solid #dc2626;
  color: var(--color-text);
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  pointer-events: none;
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
