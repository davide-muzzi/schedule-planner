<script setup>
import { computed, onMounted } from 'vue'
import { Wind, Droplet, Sunrise, Sunset, Cloud } from '@lucide/vue'
import { useWeather } from '@/composables/useWeather'
import { weatherCode } from '@/utils/weatherCodes'

const { data, locationLabel, lastFetchedAt, stale, fetchWeather } = useWeather()

onMounted(() => {
  fetchWeather()
})

const DASH = '–'
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function round(n) {
  return Math.round(n)
}

// "2026-08-24T06:35" -> "06:35"
function formatTimeOfDay(isoString) {
  const time = isoString?.split('T')[1]
  return time ? time.slice(0, 5) : DASH
}

const eyebrowLocation = computed(() => locationLabel.value || '…')

const updatedTime = computed(() => {
  if (!lastFetchedAt.value) return DASH
  return lastFetchedAt.value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
})

// Values collapse to "–" rather than the page showing a spinner/skeleton
// while the first-ever fetch of the session is still in flight (weather-page.md §5).
const hero = computed(() => {
  if (!data.value) {
    return { icon: Cloud, muted: true, temperature: DASH, summary: DASH, detail: DASH }
  }
  const { icon, description } = weatherCode(data.value.current.weatherCode)
  return {
    icon,
    muted: false,
    temperature: round(data.value.current.temperature),
    summary: description,
    detail: `Feels like ${round(data.value.current.apparentTemperature)}° · high ${round(data.value.todayHigh)}° / low ${round(data.value.todayLow)}°`
  }
})

const quad = computed(() => [
  { label: 'Wind', icon: Wind, value: data.value ? `${round(data.value.current.windSpeed)} km/h` : DASH },
  { label: 'Humidity', icon: Droplet, value: data.value ? `${round(data.value.current.relativeHumidity)}%` : DASH },
  { label: 'Sunrise', icon: Sunrise, value: data.value ? formatTimeOfDay(data.value.sunrise) : DASH },
  { label: 'Sunset', icon: Sunset, value: data.value ? formatTimeOfDay(data.value.sunset) : DASH }
])

const forecast = computed(() => {
  if (!data.value) {
    return Array.from({ length: 7 }, (_, i) => ({
      key: i,
      isToday: i === 0,
      dayLabel: DASH,
      icon: Cloud,
      hi: DASH,
      lo: DASH,
      rain: 0,
      rainLabel: DASH
    }))
  }
  return data.value.daily.map((day, i) => {
    const { icon } = weatherCode(day.weatherCode)
    const date = new Date(day.date + 'T00:00:00')
    return {
      key: day.date,
      isToday: i === 0,
      dayLabel: i === 0 ? 'Today' : WEEKDAY_LABELS[date.getDay()],
      icon,
      hi: round(day.tempMax),
      lo: round(day.tempMin),
      rain: day.precipitationProbabilityMax,
      rainLabel: `${round(day.precipitationProbabilityMax)}%`
    }
  })
})
</script>

<template>
  <section class="page">
    <div class="header">
      <p class="kicker">
        {{ eyebrowLocation }} · updated {{ updatedTime }}<span v-if="stale" class="stale"> · stale</span>
      </p>
      <h1 class="title">Weather</h1>
    </div>

    <div class="top-row">
      <div class="card hero-card">
        <component :is="hero.icon" :size="76" class="hero-icon" :class="{ muted: hero.muted }" />
        <div class="hero-body">
          <div class="temp">
            <span class="temp-value">{{ hero.temperature }}</span>
            <span class="temp-unit">°C</span>
          </div>
          <p class="summary">{{ hero.summary }}</p>
          <p class="detail">{{ hero.detail }}</p>
        </div>
      </div>

      <div class="quad">
        <div v-for="cell in quad" :key="cell.label" class="quad-cell">
          <span class="quad-label"><component :is="cell.icon" :size="13" />{{ cell.label }}</span>
          <span class="quad-value">{{ cell.value }}</span>
        </div>
      </div>
    </div>

    <div class="forecast-label">
      <span class="forecast-left">next 7 days</span>
      <span class="forecast-right">Open-Meteo · no key required</span>
    </div>

    <div class="forecast-strip">
      <div
        v-for="(day, i) in forecast"
        :key="day.key"
        class="forecast-cell"
        :class="{ today: day.isToday }"
        :style="{ animationDelay: i * 55 + 'ms' }"
      >
        <span class="day-label" :class="{ accent: day.isToday }">{{ day.dayLabel }}</span>
        <component :is="day.icon" :size="28" class="day-icon" />
        <div class="hi-lo">
          <span class="hi">{{ day.hi }}°</span>
          <span class="lo">{{ day.lo }}°</span>
        </div>
        <div class="rain-track">
          <div class="rain-fill" :style="{ width: day.rain + '%', animationDelay: i * 55 + 'ms' }"></div>
        </div>
        <span class="rain-pct">{{ day.rainLabel }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page {
  animation: fadeUp 0.34s var(--ease) both;
}

.header {
  margin-bottom: 20px;
}

.kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--mute);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.stale {
  color: var(--warn);
}

.title {
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: var(--fg);
}

.top-row {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 28px;
  margin-bottom: 28px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r2);
}

.hero-card {
  display: flex;
  align-items: center;
  gap: 34px;
  padding: 34px 36px;
}

.hero-icon {
  color: var(--accent);
  animation: pop 0.5s var(--ease) both;
  flex-shrink: 0;
}

.hero-icon.muted {
  color: var(--mute);
  animation: none;
}

.hero-body {
  min-width: 0;
}

.temp {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.temp-value {
  font-family: var(--font-mono);
  font-size: 58px;
  font-weight: 500;
  line-height: 0.95;
  letter-spacing: -0.03em;
  color: var(--fg);
}

.temp-unit {
  font-family: var(--font-mono);
  font-size: 22px;
  color: var(--dim);
  margin-top: 4px;
}

.summary {
  font-size: 14px;
  color: var(--fg);
  margin-top: 8px;
}

.detail {
  font-size: 12px;
  color: var(--mute);
  margin-top: 2px;
}

.quad {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: var(--r2);
  overflow: hidden;
}

.quad-cell {
  background: var(--surface);
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  animation: fadeUp 0.4s var(--ease) both;
}

.quad-cell:nth-child(1) {
  animation-delay: 0ms;
}
.quad-cell:nth-child(2) {
  animation-delay: 60ms;
}
.quad-cell:nth-child(3) {
  animation-delay: 120ms;
}
.quad-cell:nth-child(4) {
  animation-delay: 180ms;
}

.quad-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--mute);
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.quad-value {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 500;
  color: var(--fg);
  white-space: nowrap;
}

.forecast-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.forecast-left {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--mute);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.forecast-right {
  font-size: 11.5px;
  color: var(--mute);
  white-space: nowrap;
}

.forecast-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: var(--r2);
  overflow: hidden;
}

.forecast-cell {
  background: var(--surface);
  padding: 22px 16px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 13px;
  animation: fadeUp 0.42s var(--ease) both;
}

.forecast-cell.today {
  background: var(--surface2);
}

.day-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dim);
}

.day-label.accent {
  color: var(--accent);
}

.day-icon {
  color: var(--accent);
}

.hi-lo {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.hi {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 500;
  color: var(--fg);
}

.lo {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--mute);
}

.rain-track {
  width: 100%;
  height: 3px;
  background: var(--surface2);
  border-radius: 2px;
  overflow: hidden;
}

.rain-fill {
  height: 100%;
  background: var(--accent-deep);
  transform-origin: left;
  animation: growX 0.5s var(--ease) both;
}

.rain-pct {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--mute);
}

@media (max-width: 900px) {
  .top-row {
    grid-template-columns: 1fr;
  }
}
</style>
