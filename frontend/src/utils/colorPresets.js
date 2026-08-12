export const COLOR_PRESETS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Grey', 'White']

const PRESET_STYLES = {
  Red: { bg: '#ef4444', text: '#ffffff', border: '#b91c1c' },
  Orange: { bg: '#f97316', text: '#ffffff', border: '#c2410c' },
  Yellow: { bg: '#eab308', text: '#1c1917', border: '#a16207' },
  Green: { bg: '#22c55e', text: '#ffffff', border: '#15803d' },
  Blue: { bg: '#3b82f6', text: '#ffffff', border: '#1d4ed8' },
  Grey: { bg: '#9ca3af', text: '#1c1917', border: '#4b5563' },
  White: { bg: '#f8fafc', text: '#1c1917', border: '#cbd5e1' },
}

export function colorStyle(preset) {
  return PRESET_STYLES[preset] || PRESET_STYLES.Grey
}
