/**
 * 计算一帧 16bit PCM 的音量，返回 0～1。
 * 用均方根再取对数映射，让正常说话的音量落在中间，波形看起来更有起伏。
 */
export function pcmLevel(frame: ArrayBuffer): number {
  const samples = new Int16Array(frame, 0, Math.floor(frame.byteLength / 2))
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]! / 32768
    sum += v * v
  }
  const rms = Math.sqrt(sum / samples.length)
  // -50dB 以下视为静音，0dB 为满格
  const db = 20 * Math.log10(Math.max(rms, 1e-6))
  return Math.min(1, Math.max(0, (db + 50) / 50))
}

/** 把毫秒格式化成 0:07 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
