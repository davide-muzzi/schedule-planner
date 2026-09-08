<script setup>
import { retryPromptVisible, retryPromptMessage, resolveRetryPrompt } from '@/utils/retryPrompt'
</script>

<template>
  <Teleport to="body">
    <div v-if="retryPromptVisible" class="overlay">
      <div class="modal">
        <h2 class="title">Couldn't recreate this item</h2>
        <p class="message">{{ retryPromptMessage }}</p>

        <footer class="modal-footer">
          <button type="button" class="skip-btn" @click="resolveRetryPrompt(false)">Skip</button>
          <button type="button" class="retry-btn" @click="resolveRetryPrompt(true)">Retry</button>
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

.skip-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.retry-btn {
  background: #3b82f6;
  border: 1px solid #1d4ed8;
  color: #fff;
}
</style>
