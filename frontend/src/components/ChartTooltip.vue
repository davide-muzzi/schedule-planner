<script setup>
// Same visual language as DayTable's entry tooltip (teleported, fixed,
// colored left border, label/value rows) - kept as data props rather than
// slots since Vue's scoped-CSS attributes wouldn't reach slot content
// authored in the parent template.
defineProps({
  title: { type: String, required: true },
  rows: { type: Array, default: () => [] }, // [{ label, value }]
  posStyle: { type: Object, default: () => ({}) },
  accentColor: { type: String, default: 'var(--line-2)' },
})
</script>

<template>
  <Teleport to="body">
    <div class="chart-tooltip" :style="[posStyle, { borderLeftColor: accentColor }]">
      <div class="tooltip-title">{{ title }}</div>
      <div v-for="row in rows" :key="row.label" class="tooltip-row">
        <span class="tooltip-label">{{ row.label }}</span><span>{{ row.value }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.chart-tooltip {
  position: fixed;
  transform: translateX(-50%);
  z-index: 300;
  width: max-content;
  max-width: 15rem;
  background: var(--surface);
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--line-2);
  border-radius: var(--r2);
  padding: 0.55rem 0.7rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.tooltip-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--fg);
  margin-bottom: 0.3rem;
}

.tooltip-row {
  display: flex;
  gap: 0.5rem;
  font-size: 0.7rem;
  color: var(--dim);
  padding: 0.1rem 0;
}

.tooltip-label {
  flex: none;
  min-width: 3.6rem;
  color: var(--mute);
}
</style>
