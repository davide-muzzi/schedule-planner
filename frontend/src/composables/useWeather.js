import { ref } from 'vue'
import weatherApi from '@/services/weatherApi'

const CACHE_MAX_AGE_MS = 15 * 60 * 1000
const GEOLOCATION_TIMEOUT_MS = 8000

// Module-level singleton (same pattern as useAppShell.js) rather than
// per-component state - the Weather view remounts every time you navigate
// back to it (so its enter animation replays, per weather-page.md §6), but
// the cached data underneath must survive that remount so the page doesn't
// flash empty and doesn't refetch more often than every ~15 min.
const data = ref(null)
const locationLabel = ref('')
const lastFetchedAt = ref(null)
const loading = ref(false)
const stale = ref(false)

// Resolved once per session and reused - coordinates don't change between
// fetches within the same tab, and re-prompting geolocation on every
// refresh would be intrusive.
let coordsPromise = null

function resolveCoords() {
  if (coordsPromise) return coordsPromise

  coordsPromise = new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: null, lon: null, label: 'Rotkreuz' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lon: position.coords.longitude, label: 'Current location' })
      },
      () => {
        resolve({ lat: null, lon: null, label: 'Rotkreuz' })
      },
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 }
    )
  })

  return coordsPromise
}

async function fetchWeather() {
  if (lastFetchedAt.value && Date.now() - lastFetchedAt.value.getTime() < CACHE_MAX_AGE_MS) {
    return
  }

  loading.value = data.value === null
  try {
    const coords = await resolveCoords()
    locationLabel.value = coords.label
    const response = await weatherApi.get(coords.lat, coords.lon)
    data.value = response.data
    lastFetchedAt.value = new Date()
    stale.value = false
  } catch {
    // Keep whatever we already had on screen; just flag it as stale rather
    // than blanking the page (weather-page.md §1).
    if (data.value) stale.value = true
  } finally {
    loading.value = false
  }
}

export function useWeather() {
  return { data, locationLabel, lastFetchedAt, loading, stale, fetchWeather }
}
