import { wrapText } from './lyrics'

/**
 * 分享卡片封面（5:4）。画布用不了 CSS 变量，颜色取自 tokens.scss 里的
 * --sv-accent-gradient（浅色版），改设计变量时这里一起改。
 */
const GRADIENT = ['#0a84ff', '#5e5ce6', '#8e5cf7'] as const
const WIDTH = 500
const HEIGHT = 400
const PADDING = 36
const FONT = "-apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif"

export const COVER_SIZE = { width: WIDTH, height: HEIGHT }

interface CoverText {
  title: string
  line: string
  author: string
}

interface Canvas2D {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D
}

/** 在 2d 画布上画封面；dpr 为像素比，画好后由调用方导出图片 */
export function drawCover(canvas: Canvas2D, text: CoverText, dpr = 2): void {
  canvas.width = WIDTH * dpr
  canvas.height = HEIGHT * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
  bg.addColorStop(0, GRADIENT[0])
  bg.addColorStop(0.55, GRADIENT[1])
  bg.addColorStop(1, GRADIENT[2])
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // 右上角一个淡淡的圆，增加层次
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.beginPath()
  ctx.arc(WIDTH - 40, 40, 150, 0, Math.PI * 2)
  ctx.fill()

  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.font = `600 22px ${FONT}`
  ctx.fillText(`${text.author}的英文朗读`, PADDING, PADDING)

  ctx.fillStyle = '#ffffff'
  ctx.font = `700 40px ${FONT}`
  const lines = wrapText(text.line, WIDTH - PADDING * 2, 4, (s) => ctx.measureText(s).width)
  const lineHeight = 52
  const top = (HEIGHT - lines.length * lineHeight) / 2 + 6
  lines.forEach((l, i) => ctx.fillText(l, PADDING, top + i * lineHeight))

  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.font = `500 22px ${FONT}`
  const title =
    wrapText(text.title, WIDTH - PADDING * 2 - 120, 1, (s) => ctx.measureText(s).width)[0] ?? ''
  ctx.fillText(title, PADDING, HEIGHT - PADDING - 24)
  ctx.textAlign = 'right'
  ctx.fillText('▶ 点开听', WIDTH - PADDING, HEIGHT - PADDING - 24)
}
