<script setup>
import { ref, computed, watch } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

// Mobile-only "one card at a time" shell used by header stat strips that
// would otherwise wrap into an awkward multi-row grid on a narrow screen.
// Purely presentational - the parent still owns the actual card content and
// picks it via the `index` the default slot is handed. Renders every slide
// (not just the active one) in a horizontal track so a drag can visually
// slide between neighbors instead of just jumping.
const props = defineProps({
  count: { type: Number, required: true },
})

const emit = defineEmits(['change'])

const index = ref(0)
const clampedIndex = computed(() => Math.min(index.value, Math.max(0, props.count - 1)))

// Every slide now stays mounted (not just the active one, see the template)
// so a drag can visually slide between neighbors - that means a card's own
// open state (e.g. a popup) no longer gets torn down for free just by
// swiping away from it. Lets a parent react (e.g. close its popups) whenever
// the visible slide actually changes, from either a button or a drag.
watch(clampedIndex, (value) => emit('change', value))

function prev() {
  index.value = (clampedIndex.value - 1 + props.count) % props.count
}

function next() {
  index.value = (clampedIndex.value + 1) % props.count
}

// Minimum drag distance (px) before a release commits to the neighboring
// slide instead of springing back to the current one.
const SWIPE_COMMIT_PX = 50

const isDragging = ref(false)
const dragDeltaPx = ref(0)
let dragStartX = 0
let activePointerId = null

function handlePointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  isDragging.value = true
  dragStartX = event.clientX
  dragDeltaPx.value = 0
  activePointerId = event.pointerId
}

function handlePointerMove(event) {
  if (!isDragging.value || event.pointerId !== activePointerId) return
  dragDeltaPx.value = event.clientX - dragStartX
}

function endDrag(event) {
  if (!isDragging.value || event.pointerId !== activePointerId) return
  isDragging.value = false
  const delta = dragDeltaPx.value
  dragDeltaPx.value = 0
  if (delta <= -SWIPE_COMMIT_PX) next()
  else if (delta >= SWIPE_COMMIT_PX) prev()
}

// A touch the OS decides is a vertical scroll gets its pointer sequence
// cancelled rather than finished with pointerup (touch-action: pan-y below
// is what tells it vertical panning is fine) - treat that the same as a
// release that didn't clear the commit threshold: spring back silently.
function handlePointerCancel(event) {
  if (!isDragging.value || event.pointerId !== activePointerId) return
  isDragging.value = false
  dragDeltaPx.value = 0
}

const trackStyle = computed(() => ({
  transform: `translateX(calc(${-clampedIndex.value * 100}% + ${dragDeltaPx.value}px))`,
  transition: isDragging.value ? 'none' : 'transform 0.3s var(--ease)',
}))
</script>

<template>
  <div class="carousel">
    <div
      class="track-viewport"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="endDrag"
      @pointercancel="handlePointerCancel"
    >
      <div class="track" :style="trackStyle">
        <div v-for="i in count" :key="i - 1" class="slide">
          <slot :index="i - 1" />
        </div>
      </div>
    </div>

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

.track-viewport {
  overflow: hidden;
  /* Let the browser keep handling vertical scroll gestures natively; only
     horizontal drags are ours to intercept. */
  touch-action: pan-y;
}

.track {
  display: flex;
  width: 100%;
  will-change: transform;
}

.slide {
  flex: none;
  width: 100%;
  /* Slides other than the active one aren't meant to be reachable except by
     dragging/swiping through them. */
  user-select: none;
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
