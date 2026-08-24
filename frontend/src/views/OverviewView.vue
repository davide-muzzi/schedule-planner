<script setup>
import { computed, ref } from 'vue'
import { ChartColumn } from '@lucide/vue'
import { useScheduleStore } from '@/stores/scheduleStore'
import { formatHours } from '@/utils/date'
import {
  hoursTrackedInYear,
  daysWithEntriesInYear,
  averagePerTrackedWeek,
  lastNWeeksSeries,
  lastNWeeksDiffSeries,
  averageByWeekday,
  longestDay,
  timeBreakdownByType,
  trackingStreakGrid,
} from '@/utils/overviewStats'
import WeeklyBalanceModal from '@/components/WeeklyBalanceModal.vue'
import OverviewWeeklyHoursChart from '@/components/OverviewWeeklyHoursChart.vue'
import OverviewWeekdayAverages from '@/components/OverviewWeekdayAverages.vue'
import OverviewBalanceTrend from '@/components/OverviewBalanceTrend.vue'
import OverviewTimeBreakdown from '@/components/OverviewTimeBreakdown.vue'
import OverviewTrackingStreak from '@/components/OverviewTrackingStreak.vue'

const WEEKLY_CHART_WEEKS = 52
const BALANCE_TREND_WEEKS = 13
const STREAK_WEEKS = 52

const store = useScheduleStore()

const currentYear = computed(() => new Date().getFullYear())
const kicker = computed(() => `${currentYear.value} to date`)

const showWeeklyBalanceModal = ref(false)
function openWeeklyBalance() {
  showWeeklyBalanceModal.value = true
}
function closeWeeklyBalance() {
  showWeeklyBalanceModal.value = false
}

// "+35m" / "-1h 20m" / "0h" - a signed variant of formatHours for the
// carried-over stat, which cares about direction as much as magnitude.
function signedHours(hours) {
  if (Math.abs(hours) < 0.01) return formatHours(0)
  return hours > 0 ? `+${formatHours(hours)}` : formatHours(hours)
}

const hoursTracked = computed(() => hoursTrackedInYear(store.entries, currentYear.value))
const avgPerTrackedWeek = computed(() => averagePerTrackedWeek(store.weeklyBalances, currentYear.value))
const daysWithEntries = computed(() => daysWithEntriesInYear(store.entries, currentYear.value))
const carriedOver = computed(() => store.overallBalance.manualAdjustmentHours)

const stats = computed(() => [
  { value: formatHours(hoursTracked.value), label: `tracked in ${currentYear.value}` },
  { value: formatHours(avgPerTrackedWeek.value), label: 'avg per tracked week' },
  { value: String(daysWithEntries.value), label: 'days with entries' },
  {
    value: signedHours(carriedOver.value),
    label: 'carried over',
    status: Math.abs(carriedOver.value) < 0.01 ? null : carriedOver.value > 0 ? 'ok' : 'bad',
  },
])

const weeklyHoursSeries = computed(() => lastNWeeksSeries(store.weeklyBalances, WEEKLY_CHART_WEEKS))
const balanceTrendSeries = computed(() => lastNWeeksDiffSeries(store.weeklyBalances, BALANCE_TREND_WEEKS))
const weekdayAverages = computed(() => averageByWeekday(store.entries, currentYear.value))
const timeBreakdown = computed(() =>
  timeBreakdownByType(store.entries, currentYear.value, store.dailyTargetHours),
)
const streakColumns = computed(() => trackingStreakGrid(store.entries, STREAK_WEEKS))

const longestDayData = computed(() => longestDay(store.entries, currentYear.value))
const longestDayCaption = computed(() => {
  const day = longestDayData.value
  if (!day) return ''
  const date = new Date(day.date + 'T00:00:00')
  const label = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return day.workLocation ? `${label} · ${day.workLocation}` : label
})
</script>

<template>
  <section class="page">
    <div class="overview-header">
      <div class="header-top">
        <div class="header-title">
          <p class="kicker">{{ kicker }}</p>
          <h1 class="title">Overview</h1>
        </div>
        <button type="button" class="weekly-balance-btn" @click="openWeeklyBalance">
          <ChartColumn :size="13" /> Weekly Balance
        </button>
      </div>

      <div class="stat-strip">
        <div v-for="(stat, i) in stats" :key="stat.label" class="stat-cell" :style="{ animationDelay: i * 70 + 'ms' }">
          <span class="stat-value" :class="stat.status ? 'status-' + stat.status : ''">{{ stat.value }}</span>
          <span class="stat-label">{{ stat.label }}</span>
        </div>
      </div>
    </div>

    <div class="body-grid">
      <div class="card large-card">
        <div class="card-heading">
          <h2>Hours per week</h2>
          <span class="meta">LAST {{ WEEKLY_CHART_WEEKS }} WEEKS</span>
        </div>
        <OverviewWeeklyHoursChart :series="weeklyHoursSeries" :target-hours="store.weeklyTargetHours" />

        <div class="divider"></div>

        <div class="sub-grid">
          <div>
            <div class="card-heading"><h2>Average by weekday</h2></div>
            <OverviewWeekdayAverages :hours-by-weekday="weekdayAverages" :daily-target-hours="store.dailyTargetHours" />
          </div>
          <div>
            <div class="card-heading">
              <h2>Balance trend</h2>
              <span class="meta">LAST {{ balanceTrendSeries.length }} WEEKS</span>
            </div>
            <OverviewBalanceTrend :series="balanceTrendSeries" />
          </div>
        </div>
      </div>

      <div class="right-column">
        <div class="card">
          <div class="card-heading"><h2>Where the time goes</h2></div>
          <OverviewTimeBreakdown :breakdown="timeBreakdown" />
        </div>

        <div class="card">
          <div class="card-heading">
            <h2>Tracking streak</h2>
            <span class="meta">{{ STREAK_WEEKS }} WEEKS</span>
          </div>
          <OverviewTrackingStreak :columns="streakColumns" />
        </div>

        <div class="card">
          <h2>Longest day</h2>
          <template v-if="longestDayData">
            <p class="longest-value">{{ formatHours(longestDayData.totalHours) }}</p>
            <p class="longest-caption">{{ longestDayCaption }}</p>
          </template>
          <p v-else class="empty-state">No Working entries yet.</p>
        </div>
      </div>
    </div>

    <WeeklyBalanceModal
      v-if="showWeeklyBalanceModal"
      :weeks="store.weeklyBalances"
      :manual-adjustment-hours="store.overallBalance.manualAdjustmentHours"
      @close="closeWeeklyBalance"
    />
  </section>
</template>

<style scoped>
.page {
  animation: fadeUp 0.34s var(--ease) both;
}

.overview-header {
  margin-bottom: 2rem;
}

.header-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 2rem;
  padding-bottom: 1.4rem;
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
}

.weekly-balance-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  border-radius: var(--r);
  border: 1px solid var(--line-2);
  background: transparent;
  color: var(--dim);
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 0.16s,
    border-color 0.16s;
}

.weekly-balance-btn:hover {
  color: var(--fg);
  border-color: var(--accent);
}

.stat-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  border-top: 1px solid var(--line-2);
  border-bottom: 1px solid var(--line-2);
}

.stat-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 16px 24px;
  border-right: 1px solid var(--line);
  animation: fadeUp 0.4s var(--ease) both;
}

.stat-cell:last-child {
  border-right: none;
}

.stat-value {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--fg);
  white-space: nowrap;
}

.stat-value.status-ok {
  color: var(--ok);
}

.stat-value.status-bad {
  color: var(--bad);
}

.stat-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--mute);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
}

.body-grid {
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: 28px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r2);
  padding: 24px 26px;
}

.large-card {
  display: flex;
  flex-direction: column;
}

.right-column {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.card-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}

.card h2 {
  font-size: 13px;
  font-weight: 500;
  color: var(--fg);
  margin: 0 0 14px;
}

.card-heading h2 {
  margin: 0;
}

.meta {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--mute);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.divider {
  height: 1px;
  background: var(--line);
  margin: 22px 0 18px;
}

.sub-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 26px;
}

.longest-value {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 500;
  color: var(--fg);
}

.longest-caption {
  font-size: 11.5px;
  color: var(--mute);
  margin-top: 3px;
}

.empty-state {
  font-size: 11.5px;
  color: var(--mute);
}

@media (max-width: 900px) {
  .body-grid {
    grid-template-columns: 1fr;
  }

  .sub-grid {
    grid-template-columns: 1fr;
  }
}
</style>
