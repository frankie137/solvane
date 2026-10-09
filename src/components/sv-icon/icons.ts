/**
 * 线性图标集（24×24 网格，圆角端点）。图标通过 CSS mask 渲染，颜色由 color 决定，
 * 因此深浅色模式下无需准备两套图片。带 .fill 后缀的是实心版本，用于选中态。
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
} as const

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as IconName[]

const cache = new Map<string, string>()

/** 生成可用于 mask-image 的 SVG data URI；同一图标和线宽只编码一次 */
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
