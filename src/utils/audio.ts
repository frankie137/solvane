/**
 * Compute the volume of a 16-bit PCM frame, from 0 to 1.
 * Uses RMS with a log mapping so normal speech lands mid-range and the waveform looks more lively.
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
  // Below -50dB counts as silence; 0dB is full scale
  const db = 20 * Math.log10(Math.max(rms, 1e-6))
  return Math.min(1, Math.max(0, (db + 50) / 50))
}

/** Format milliseconds as 0:07 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
