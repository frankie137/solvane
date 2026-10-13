/**
 * Line icon set (24×24 grid, round caps). Icons render via CSS mask and take their color from color,
 * so light and dark modes don't need separate images. Names ending in .fill are solid variants for selected states.
 */
const ICONS = {
  waveform: '<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>',
  mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
  'mic.fill':
    '<rect x="9" y="2.5" width="6" height="12" rx="3" fill="#000"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
  keyboard:
    '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8"/>',
  bookmark: '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4.2L6 21z"/>',
  'bookmark.fill':
    '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4.2L6 21z" fill="#000"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  'person.fill':
    '<circle cx="12" cy="8" r="4" fill="#000"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0z" fill="#000"/>',
  folder:
    '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  sparkles:
    '<path d="M11 3l1.7 4.8L17.5 9.5l-4.8 1.7L11 16l-1.7-4.8L4.5 9.5l4.8-1.7z"/><path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  'chevron.right': '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  'chevron.left': '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  sliders:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10a4.25 4.25 0 0 1-.75 8.5z"/>',
  speaker:
    '<path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  graduation:
    '<path d="M2.5 9L12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c1.5 1.3 3.4 2 5.5 2s4-.7 5.5-2V11M21.5 9v5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  checkmark: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  'arrow.up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
  xmark: '<path d="M6 6l12 12M18 6L6 18"/>',
  'play.fill':
    '<path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z" fill="#000"/>',
  'stop.fill': '<rect x="6.5" y="6.5" width="11" height="11" rx="2.2" fill="#000"/>',
  retry: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z"/>',
  chat: '<path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 16h-8l-4.5 4v-4H6a1.5 1.5 0 0 1-1.5-1.5z"/>',
  lightbulb:
    '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2v.2h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  tag: '<path d="M3.5 12.1V4.5a1 1 0 0 1 1-1h7.6l8.4 8.4a1.5 1.5 0 0 1 0 2.1l-6.5 6.5a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20.5 20.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash:
    '<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l.9 12.6a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.6M10 10.5v6M14 10.5v6"/>',
  pencil: '<path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5zM14 7l3 3"/>',
  ellipsis:
    '<circle cx="5.5" cy="12" r="1.2" fill="#000"/><circle cx="12" cy="12" r="1.2" fill="#000"/><circle cx="18.5" cy="12" r="1.2" fill="#000"/>',
  'pause.fill':
    '<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="#000"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="#000"/>',
  share:
    '<path d="M12 3.5v11M8 7l4-3.5L16 7"/><path d="M8.5 10.5H6.5A1.5 1.5 0 0 0 5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7a1.5 1.5 0 0 0-1.5-1.5h-2"/>',
  'chevron.up': '<path d="M5.5 14.5L12 8l6.5 6.5"/>',
  'chevron.down': '<path d="M5.5 9.5L12 16l6.5-6.5"/>',
  quote:
    '<path d="M5 17.5c0-4 1.5-7 4.5-8.5M14 17.5c0-4 1.5-7 4.5-8.5"/><circle cx="7" cy="15.5" r="2"/><circle cx="16" cy="15.5" r="2"/>',
  crown: '<path d="M4 8l4 4 4-6.5 4 6.5 4-4-1.5 10h-13z"/><path d="M5.5 20.5h13"/>',
  people:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
} as const

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as IconName[]

const cache = new Map<string, string>()

/** Build an SVG data URI for mask-image; each icon and stroke width is encoded only once */
export function iconDataUri(name: IconName, weight = 1.8): string {
  const key = `${name}@${weight}`
  const hit = cache.get(key)
  if (hit) return hit
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" ` +
    `stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  cache.set(key, uri)
  return uri
}
