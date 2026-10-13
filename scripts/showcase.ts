/**
 * Render docs/showcase/flow.html: an animated WebP per theme (the README shows the light one) and
 * an MP4 per theme for social posts, optionally with a music track mixed in.
 *
 * The render tools are not project dependencies. Install them once in any directory and point
 * SHOWCASE_TOOLS at it:
 *
 *   npm i --prefix <dir> playwright ffmpeg-static && npx --prefix <dir> playwright install chromium
 *   SHOWCASE_TOOLS=<dir> pnpm showcase [--theme light|dark|both] [--audio <file> --audio-start <s>]
 *
 * Both go to docs/showcase/flow-<theme>.{webp,mp4}. The committed MP4s carry "Pop 09" by Grigoriy
 * Nuzhny (Mixkit Stock Music Free License), rendered with --audio-start 47.9986: 8 bars on the
 * track's beat grid, so every tap lands on a beat. Music licenses usually forbid redistributing the
 * audio file itself, so keep the track outside the repository.
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(__dirname, '..')
const SIZE = 1440
const FPS = 60
/** The README column is about 880 px wide; 960 px keeps text sharp without a huge file */
const WEBP_SIZE = 960
const WEBP_FPS = 30
/**
 * Pick a 16 s window that starts and ends on bar lines of the same section: the MP4 then loops
 * with the music, so only a short fade guards against a click at the cut
 */
const FADE_OUT = 0.15

/** The small part of Playwright's API this script uses */
interface Page {
  goto(url: string): Promise<unknown>
  evaluate(expression: string): Promise<unknown>
  screenshot(options: { type: 'png' }): Promise<Buffer>
  on(event: 'pageerror', listener: (error: Error) => void): void
}
interface Browser {
  newPage(options: { viewport: { width: number; height: number } }): Promise<Page>
  close(): Promise<void>
}
interface Playwright {
  chromium: { launch(): Promise<Browser> }
}

function loadTools(): { playwright: Playwright; ffmpeg: string } {
  const dir = process.env.SHOWCASE_TOOLS
  if (!dir) {
    console.error('Set SHOWCASE_TOOLS to a directory with playwright and ffmpeg-static installed')
    process.exit(1)
  }
  const load = createRequire(join(resolve(dir), 'package.json'))
  return {
    playwright: load('playwright') as Playwright,
    ffmpeg: load('ffmpeg-static') as string,
  }
}

function ffmpegArgs(theme: string, audio?: { file: string; start: number }, duration = 0) {
  const mp4 = join(root, `docs/showcase/flow-${theme}.mp4`)
  const webp = join(root, `docs/showcase/flow-${theme}.webp`)
  const input = ['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-']
  const audioIn = audio
    ? ['-ss', String(audio.start), '-t', String(duration), '-i', audio.file]
    : []
  const audioOut = audio
    ? [
        '-map',
        '1:a',
        '-af',
        `afade=t=in:d=0.02,afade=t=out:st=${duration - FADE_OUT}:d=${FADE_OUT}`,
        '-c:a',
        'aac',
        '-b:a',
        '192k',
      ]
    : []
  const filter =
    `[0:v]split=2[mp4][web];` +
    `[web]fps=${WEBP_FPS},scale=${WEBP_SIZE}:${WEBP_SIZE}:flags=lanczos[webp]`
  return {
    files: [webp, mp4],
    args: [
      ...['-y', '-hide_banner', '-loglevel', 'error'],
      ...input,
      ...audioIn,
      ...['-filter_complex', filter],
      ...['-map', '[mp4]', ...audioOut],
      ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p'],
      ...['-movflags', '+faststart', mp4],
      ...['-map', '[webp]', '-c:v', 'libwebp_anim', '-quality', '78', '-compression_level', '6'],
      ...['-loop', '0', webp],
    ],
  }
}

async function render(
  browser: Browser,
  ffmpeg: string,
  theme: string,
  audio?: { file: string; start: number },
) {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const url = pathToFileURL(join(root, 'docs/showcase/flow.html'))
  url.search = theme === 'dark' ? '?render&theme=dark' : '?render'
  await page.goto(url.href)
  await page.evaluate('window.showcaseReady')
  const duration = Number(await page.evaluate('window.DURATION'))

  const { args, files } = ffmpegArgs(theme, audio, duration)
  const proc = spawn(ffmpeg, args, { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = once(proc, 'close')

  const frames = Math.round(duration * FPS)
  const started = Date.now()
  for (let i = 0; i < frames; i++) {
    await page.evaluate(`window.seek(${i / FPS})`)
    const png = await page.screenshot({ type: 'png' })
    if (!proc.stdin.write(png)) await once(proc.stdin, 'drain')
    if (i % FPS === 0) process.stdout.write(`\r${theme}: ${i}/${frames} frames`)
  }
  proc.stdin.end()
  const [code] = (await done) as [number]
  const seconds = ((Date.now() - started) / 1000).toFixed(0)
  process.stdout.write(`\r${theme}: ${frames}/${frames} frames in ${seconds} s\n`)
  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`)
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}`)
  for (const f of files) console.info(`  → ${f.replace(`${root}/`, '')}`)
}

async function main() {
  const { values } = parseArgs({
    options: {
      theme: { type: 'string', default: 'both' },
      audio: { type: 'string' },
      'audio-start': { type: 'string', default: '0' },
    },
  })
  const themes = values.theme === 'both' ? ['light', 'dark'] : [values.theme ?? 'light']
  const audio = values.audio
    ? { file: resolve(values.audio), start: Number(values['audio-start']) }
    : undefined

  const { playwright, ffmpeg } = loadTools()
  const browser = await playwright.chromium.launch()
  try {
    for (const theme of themes) await render(browser, ffmpeg, theme, audio)
  } finally {
    await browser.close()
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
