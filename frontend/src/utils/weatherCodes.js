import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudRainWind, CloudSnow, CloudLightning } from '@lucide/vue'

// WMO weather code -> icon + description, shared between the hero card and
// the forecast strip cells so both read a code the same way (weather-page.md §5).
const CODES = {
  0: { icon: Sun, description: 'Clear sky' },
  1: { icon: CloudSun, description: 'Mainly clear' },
  2: { icon: CloudSun, description: 'Partly cloudy' },
  3: { icon: Cloud, description: 'Overcast' },
  45: { icon: CloudFog, description: 'Fog' },
  48: { icon: CloudFog, description: 'Depositing rime fog' },
  51: { icon: CloudDrizzle, description: 'Light drizzle' },
  53: { icon: CloudDrizzle, description: 'Drizzle' },
  55: { icon: CloudDrizzle, description: 'Dense drizzle' },
  56: { icon: CloudDrizzle, description: 'Freezing drizzle' },
  57: { icon: CloudDrizzle, description: 'Dense freezing drizzle' },
  61: { icon: CloudRain, description: 'Slight rain' },
  63: { icon: CloudRain, description: 'Rain' },
  65: { icon: CloudRain, description: 'Heavy rain' },
  66: { icon: CloudRain, description: 'Freezing rain' },
  67: { icon: CloudRain, description: 'Heavy freezing rain' },
  71: { icon: CloudSnow, description: 'Slight snow' },
  73: { icon: CloudSnow, description: 'Snow' },
  75: { icon: CloudSnow, description: 'Heavy snow' },
  77: { icon: CloudSnow, description: 'Snow grains' },
  80: { icon: CloudRainWind, description: 'Rain showers' },
  81: { icon: CloudRainWind, description: 'Rain showers' },
  82: { icon: CloudRainWind, description: 'Violent rain showers' },
  85: { icon: CloudSnow, description: 'Snow showers' },
  86: { icon: CloudSnow, description: 'Heavy snow showers' },
  95: { icon: CloudLightning, description: 'Thunderstorm' },
  96: { icon: CloudLightning, description: 'Thunderstorm with hail' },
  99: { icon: CloudLightning, description: 'Thunderstorm with heavy hail' }
}

// Never render an empty icon slot for a code Open-Meteo adds later.
const FALLBACK = { icon: Cloud, description: 'Unknown' }

export function weatherCode(code) {
  return CODES[code] ?? FALLBACK
}
