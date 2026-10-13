import { describe, expect, it } from 'vitest'
import { pcmDurationMs, pcmToWav, slicePcm, wavToPcm } from '../src/lib/audio'

/**
 * Generates PCM of the given length in ms; each sample value equals its index, so slice
 * positions are easy to check
 */
function pcm(ms: number): Buffer {
  const samples = ms * 16
  const buf = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) buf.writeInt16LE(i % 32768, i * 2)
  return buf
}

describe('PCM and WAV', () => {
  it('computes duration at 32 bytes per millisecond', () => {
    expect(pcmDurationMs(pcm(1500))).toBe(1500)
  })

  it('writes a 16 kHz mono 16-bit WAV header', () => {
    const wav = pcmToWav(pcm(100))
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(16000)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.readUInt32LE(40)).toBe(3200)
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8)
  })

  it('converts between WAV and PCM without losing data', () => {
    const source = pcm(250)
    expect(wavToPcm(pcmToWav(source)).equals(source)).toBe(true)
  })

  it('skips other chunks before data', () => {
    const source = pcm(10)
    const wav = pcmToWav(source)
    const extra = Buffer.alloc(8 + 4)
    extra.write('LIST', 0, 'ascii')
    extra.writeUInt32LE(4, 4)
    const withList = Buffer.concat([wav.subarray(0, 36), extra, wav.subarray(36)])
    expect(wavToPcm(withList).equals(source)).toBe(true)
  })

  it('throws when the input is not a WAV', () => {
    expect(() => wavToPcm(Buffer.from('not a wav file'))).toThrow()
  })
})

describe('slicePcm', () => {
  const source = pcm(1000)

  it('slices by milliseconds, starting at the correct sample', () => {
    const slice = slicePcm(source, 100, 200)
    expect(slice.length).toBe(100 * 32)
    expect(slice.readInt16LE(0)).toBe(100 * 16)
  })

  it('clips anything out of range', () => {
    expect(slicePcm(source, -50, 30).length).toBe(30 * 32)
    expect(slicePcm(source, 990, 2000).length).toBe(10 * 32)
    expect(slicePcm(source, 1200, 1300).length).toBe(0)
  })

  it('aligns fractional milliseconds to whole samples', () => {
    expect(slicePcm(source, 10.3, 20.7).length % 2).toBe(0)
  })
})
