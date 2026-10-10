/**
 * 录音统一是 16kHz、16bit、单声道的 PCM：每毫秒 32 字节。
 * 回放需要 WAV（PCM 加一个 44 字节的文件头），评测需要按时间切出的 PCM 片段。
 */
export const SAMPLE_RATE = 16_000
const BYTES_PER_SAMPLE = 2
const BYTES_PER_MS = (SAMPLE_RATE * BYTES_PER_SAMPLE) / 1000

export function pcmDurationMs(pcm: Buffer): number {
  return Math.floor(pcm.length / BYTES_PER_MS)
}

export function pcmToWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16) // fmt 块长度
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // 单声道
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28) // 每秒字节数
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32) // 块对齐
  header.writeUInt16LE(16, 34) // 位深
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** 取出 WAV 里的 PCM 数据；不是本模块生成的标准 WAV 时按块查找 data */
export function wavToPcm(wav: Buffer): Buffer {
  if (
    wav.length < 12 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('不是 WAV 文件')
  }
  let offset = 12
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    if (id === 'data') return wav.subarray(offset + 8, Math.min(wav.length, offset + 8 + size))
    offset += 8 + size + (size % 2)
  }
  throw new Error('WAV 文件里没有音频数据')
}

/** 按毫秒切出一段 PCM，边界对齐到采样点，超出范围的部分自动截掉 */
export function slicePcm(pcm: Buffer, startMs: number, endMs: number): Buffer {
  const align = (bytes: number) => bytes - (bytes % BYTES_PER_SAMPLE)
  const start = align(Math.max(0, Math.floor(startMs * BYTES_PER_MS)))
  const end = align(Math.min(pcm.length, Math.ceil(endMs * BYTES_PER_MS)))
  return end > start ? pcm.subarray(start, end) : Buffer.alloc(0)
}
