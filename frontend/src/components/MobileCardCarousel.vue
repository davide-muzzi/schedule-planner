<script setup>
import { ref, computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

// Mobile-only "one card at a time" shell used by header stat strips that
// would otherwise wrap into an awkward multi-row grid on a narrow screen.
// Purely presentational - the parent still owns the actual card content and
// picks it via the `index` the default slot is handed.
const props = defineProps({
  count: { type: Number, required: true },
})

const index = ref(0)
const clampedIndex = computed(() => Math.min(index.value, Math.max(0, props.count - 1)))

function prev() {
  index.value = (clampedIndex.value - 1 + props.count) % props.count
}

function next() {
  index.value = (clampedIndex.value + 1) % props.count
}
</script>

<template>
  <div class="carousel">
    <slot :index="clampedIndex" />

    <div class="carousel-controls">
      <button type="button" class="carousel-nav" aria-label="Previous" @click="prev">
        <ChevronLeft :size="18" />
      </button>
      <div class="carousel-dots">
        <span v-for="i in count" :key="i" class="dot" :class="{ active: i - 1 === clampedIndex }"></span>
      </div>
      <button type="button" class="carousel-nav" aria-label="Next" @click="next">
        <ChevronRight :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.carousel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.carousel-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.carousel-nav {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--dim);
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.carousel-nav:hover {
  color: var(--fg);
  border-color: var(--accent);
}

.carousel-dots {
  display: flex;
  align-items: center;
  gap: 7px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--line-2);
  transition: background-color 0.16s;
}

.dot.active {
  background: var(--accent);
}
</style>
