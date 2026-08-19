<script setup>
import { ChartBar } from '@lucide/vue'
</script>

<template>
  <section class="page">
    <p class="kicker">2026 to date</p>
    <h1 class="title">Overview</h1>
    <div class="placeholder">
      <ChartBar :size="28" />
      <p>Overview is being redesigned next - stats, charts and streak will land here.</p>
    </div>
  </section>
</template>

<style scoped>
.page {
  max-width: 1180px;
  animation: fadeUp 0.34s var(--ease) both;
}

.kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--mute);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.title {
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: var(--fg);
  margin-bottom: 28px;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 24px;
  border: 1px dashed var(--line-2);
  border-radius: var(--r2);
  color: var(--mute);
  text-align: center;
}
</style>
