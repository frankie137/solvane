import { describe, expect, it } from 'vitest'
import { pcmDurationMs, pcmToWav, slicePcm, wavToPcm } from '../src/lib/audio'

/** 生成指定毫秒数的 PCM，每个采样值等于它的序号，方便检查切片位置 */
function pcm(ms: number): Buffer {
  const samples = ms * 16
  const buf = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) buf.writeInt16LE(i % 32768, i * 2)
  return buf
}

describe('PCM 与 WAV', () => {
  it('时长按每毫秒 32 字节计算', () => {
    expect(pcmDurationMs(pcm(1500))).toBe(1500)
  })

  it('WAV 文件头符合 16kHz 单声道 16bit', () => {
    const wav = pcmToWav(pcm(100))
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(16000)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.readUInt32LE(40)).toBe(3200)
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8)
  })

  it('WAV 和 PCM 来回转换不丢数据', () => {
    const source = pcm(250)
    expect(wavToPcm(pcmToWav(source)).equals(source)).toBe(true)
  })

  it('能跳过 data 之前的其他块', () => {
    const source = pcm(10)
    const wav = pcmToWav(source)
    const extra = Buffer.alloc(8 + 4)
    extra.write('LIST', 0, 'ascii')
    extra.writeUInt32LE(4, 4)
    const withList = Buffer.concat([wav.subarray(0, 36), extra, wav.subarray(36)])
    expect(wavToPcm(withList).equals(source)).toBe(true)
  })

  it('不是 WAV 时报错', () => {
    expect(() => wavToPcm(Buffer.from('not a wav file'))).toThrow()
  })
})

describe('slicePcm', () => {
  const source = pcm(1000)

  it('按毫秒切片，起点对应正确的采样', () => {
    const slice = slicePcm(source, 100, 200)
    expect(slice.length).toBe(100 * 32)
    expect(slice.readInt16LE(0)).toBe(100 * 16)
  })

  it('超出范围的部分截掉', () => {
    expect(slicePcm(source, -50, 30).length).toBe(30 * 32)
    expect(slicePcm(source, 990, 2000).length).toBe(10 * 32)
    expect(slicePcm(source, 1200, 1300).length).toBe(0)
  })

  it('非整数毫秒也对齐到完整采样', () => {
    expect(slicePcm(source, 10.3, 20.7).length % 2).toBe(0)
  })
})
