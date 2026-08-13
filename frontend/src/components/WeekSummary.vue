<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { formatWeekRange, formatHours } from '@/utils/date'
import { RED_THRESHOLD_HOURS, YELLOW_THRESHOLD_HOURS } from '@/utils/constants'

const props = defineProps({
  monday: { type: Date, required: true },
  weeklyTotalHours: { type: Number, required: true },
  overallBalance: { type: Object, required: true }, // { actualHours, expectedHours, manualAdjustmentHours, diffHours }
})

const emit = defineEmits(['prev', 'next', 'today', 'apply-adjustment'])

const diff = computed(() => props.overallBalance.diffHours)

const status = computed(() => {
  if (diff.value >= 0) return 'green' // goal reached or exceeded
  const shortfall = Math.abs(diff.value)
  if (shortfall > RED_THRESHOLD_HOURS) return 'red'
  if (shortfall > YELLOW_THRESHOLD_HOURS) return 'yellow'
  return 'green'
})

const diffLabel = computed(() => {
  if (Math.abs(diff.value) < 0.01) return 'right on target'
  const label = formatHours(Math.abs(diff.value))
  return diff.value > 0 ? `${label} over` : `${label} under`
})

const currentAdjustmentLabel = computed(() => {
  const h = props.overallBalance.manualAdjustmentHours
  if (Math.abs(h) < 0.01) return 'No correction applied'
  return `Current correction: ${h > 0 ? '+' : ''}${formatHours(h)}`
})

const showAdjustPopup = ref(false)
const adjustHours = ref(0)
const adjustMinutes = ref(0)

function toggleAdjustPopup() {
  showAdjustPopup.value = !showAdjustPopup.value
  adjustHours.value = 0
  adjustMinutes.value = 0
}

function closeAdjustPopup() {
  showAdjustPopup.value = false
}

function applyAdjustment(sign) {
  const deltaMinutes = sign * (Math.max(0, adjustHours.value || 0) * 60 + Math.max(0, adjustMinutes.value || 0))
  if (deltaMinutes === 0) return
  emit('apply-adjustment', deltaMinutes)
  showAdjustPopup.value = false
}

onMounted(() => document.addEventListener('click', closeAdjustPopup))
onBeforeUnmount(() => document.removeEventListener('click', closeAdjustPopup))
</script>

<template>
  <div class="week-summary">
    <div class="nav">
      <button type="button" class="nav-btn" @click="emit('prev')" aria-label="Previous week">&larr;</button>
      <div class="range">
        <span class="range-label">{{ formatWeekRange(monday) }}</span>
        <button type="button" class="today-btn" @click="emit('today')">Today</button>
      </div>
      <button type="button" class="nav-btn" @click="emit('next')" aria-label="Next week">&rarr;</button>
    </div>

    <div class="totals">
      <div class="total-block">
        <span class="total-label">Worked this week</span>
        <span class="total-value">{{ formatHours(weeklyTotalHours) }}</span>
      </div>
      <div class="total-block">
        <span class="total-label">Expected (all-time)</span>
        <span class="total-value">{{ formatHours(overallBalance.expectedHours) }}</span>
      </div>
      <div class="total-block adjustable" :class="'status-' + status">
        <button type="button" class="adjust-trigger" @click.stop="toggleAdjustPopup">
          <span class="total-label">Overall balance</span>
          <span class="total-value">{{ diffLabel }}</span>
        </button>

        <div v-if="showAdjustPopup" class="adjust-popup" @click.stop>
          <p class="adjust-current">{{ currentAdjustmentLabel }}</p>
          <div class="adjust-inputs">
            <label>
              h
              <input v-model.number="adjustHours" type="number" min="0" />
            </label>
            <label>
              min
              <input v-model.number="adjustMinutes" type="number" min="0" max="59" />
            </label>
          </div>
          <div class="adjust-actions">
            <button type="button" class="adjust-btn subtract" @click="applyAdjustment(-1)">− Subtract</button>
            <button type="button" class="adjust-btn add" @click="applyAdjustment(1)">+ Add</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.week-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
  margin-bottom: 1.25rem;
}

.nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.nav-btn {
  font-size: 1rem;
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.nav-btn:hover {
  border-color: var(--color-border-hover);
}

.range {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}

.range-label {
  font-weight: 600;
  color: var(--color-heading);
}

.today-btn {
  font-size: 0.7rem;
  padding: 0.1rem 0.5rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  opacity: 0.75;
  cursor: pointer;
}

.totals {
  display: flex;
  gap: 1.5rem;
}

.total-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 6.5rem;
}

.total-label {
  font-size: 0.7rem;
  opacity: 0.65;
}

.total-value {
  font-size: 1.05rem;
  font-weight: 700;
}

.status-green .total-value {
  color: #16a34a;
}

.status-yellow .total-value {
  color: #ca8a04;
}

.status-red .total-value {
  color: #dc2626;
}

.total-block.adjustable {
  position: relative;
}

.adjust-trigger {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
  cursor: pointer;
}

.adjust-popup {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 10;
  width: 13rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem;
  text-align: left;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.adjust-current {
  font-size: 0.75rem;
  opacity: 0.75;
  margin-bottom: 0.5rem;
}

.adjust-inputs {
  display: flex;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}

.adjust-inputs label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-heading);
  flex: 1;
}

.adjust-inputs input {
  padding: 0.3rem 0.4rem;
  border-radius: 5px;
  border: 1px solid var(--color-border);
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 0.85rem;
  font-family: inherit;
  width: 100%;
}

.adjust-actions {
  display: flex;
  gap: 0.5rem;
}

.adjust-btn {
  flex: 1;
  padding: 0.35rem 0;
  border-radius: 5px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.adjust-btn.add {
  background: #3b82f6;
  border: 1px solid #1d4ed8;
  color: #fff;
}

.adjust-btn.subtract {
  background: #dc2626;
  border: 1px solid #b91c1c;
  color: #fff;
}
</style>
