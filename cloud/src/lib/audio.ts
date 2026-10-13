/**
 * Recordings are always 16 kHz, 16-bit, mono PCM: 32 bytes per millisecond.
 * Playback needs WAV (PCM plus a 44-byte header); assessment needs PCM segments cut by time.
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
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28) // byte rate
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** Extracts the PCM data from a WAV; for WAVs not written here, walks the chunks to find data */
export function wavToPcm(wav: Buffer): Buffer {
  if (
    wav.length < 12 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('Not a WAV file')
  }
  let offset = 12
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    if (id === 'data') return wav.subarray(offset + 8, Math.min(wav.length, offset + 8 + size))
    offset += 8 + size + (size % 2)
  }
  throw new Error('No audio data in WAV file')
}

/** Cuts PCM by milliseconds, aligning bounds to samples and clipping anything out of range */
export function slicePcm(pcm: Buffer, startMs: number, endMs: number): Buffer {
  const align = (bytes: number) => bytes - (bytes % BYTES_PER_SAMPLE)
  const start = align(Math.max(0, Math.floor(startMs * BYTES_PER_MS)))
  const end = align(Math.min(pcm.length, Math.ceil(endMs * BYTES_PER_MS)))
  return end > start ? pcm.subarray(start, end) : Buffer.alloc(0)
}
