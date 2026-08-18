export const ENTRY_TYPES = ['Working', 'Vacation', 'Appointment', 'OvertimeCompensation', 'Other']

export const DEFAULT_ENTRY_TYPE_COLORS = {
  Working: '#3b82f6',
  Vacation: '#22c55e',
  Appointment: '#ef4444',
  OvertimeCompensation: '#a855f7',
  Other: '#f97316',
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean, 16)
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

// WCAG relative luminance - decides whether black or white text reads better
// on top of an arbitrary user-picked background color.
function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function darken(hex, amount) {
  const { r, g, b } = hexToRgb(hex)
  const dr = Math.round(r * (1 - amount))
  const dg = Math.round(g * (1 - amount))
  const db = Math.round(b * (1 - amount))
  return `rgb(${dr}, ${dg}, ${db})`
}

// Border/text are derived from the single stored bg color so a user only
// ever has to pick one color per entry type - same trio shape (bg/text/border)
// DayTable's block/banner styling already expects.
export function colorStyleForType(entryType, colors) {
  const bg = colors?.[entryType] || DEFAULT_ENTRY_TYPE_COLORS[entryType] || '#9ca3af'
  const text = relativeLuminance(hexToRgb(bg)) > 0.5 ? '#1c1917' : '#ffffff'
  const border = darken(bg, 0.3)
  return { bg, text, border }
}
