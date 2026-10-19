// Measures the song the film is cut to: node tools/analyze-music.ts [song] [out.json]
// Writes audio/final-impact-2-end.analysis.json: tempo and beat grid, onsets with strength, band energy every
// frame (sub, low, mid, high), silences, and section boundaries. The source file's sha256 is
// recorded so the film can refuse an analysis of other bytes. Measurements only; what they mean is
// decided in the film's code.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const src = process.argv[2] ?? 'audio/final-impact-2-end.wav'
const RATE = 48000
const FPS = 60
const bytes = readFileSync(src)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', src, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 })
const x = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
const duration = x.length / RATE

// Short-time spectra, hop = 1/240 s, window 2048.
const N = 2048
const HOP = RATE / 240
const frames = Math.floor((x.length - N) / HOP)
const re = new Float64Array(N), im = new Float64Array(N)
const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
const fft = () => {
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const a = (-2 * Math.PI) / len
    for (let i = 0; i < N; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k), wi = Math.sin(a * k)
        const ur = re[i + k], ui = im[i + k]
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr
        re[i + k] = ur + vr; im[i + k] = ui + vi
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi
      }
  }
}
const binHz = RATE / N
const bands = { sub: [20, 90], low: [90, 300], mid: [300, 3000], high: [3000, 16000] } as const
const bandNames = Object.keys(bands) as (keyof typeof bands)[]
const energy = Object.fromEntries(bandNames.map((b) => [b, new Float64Array(frames)])) as Record<keyof typeof bands, Float64Array>
const flux = new Float64Array(frames)
const rms = new Float64Array(frames)
let prev = new Float64Array(N / 2)
for (let f = 0; f < frames; f++) {
  const o = Math.round(f * HOP)
  let s = 0
  for (let i = 0; i < N; i++) {
    re[i] = x[o + i] * win[i]
    im[i] = 0
    s += x[o + i] * x[o + i]
  }
  rms[f] = Math.sqrt(s / N)
  fft()
  const mag = new Float64Array(N / 2)
  let fl = 0
  for (let k = 1; k < N / 2; k++) {
    mag[k] = Math.log1p(1000 * Math.hypot(re[k], im[k]))
    fl += Math.max(0, mag[k] - prev[k])
    const hz = k * binHz
    for (const b of bandNames) if (hz >= bands[b][0] && hz < bands[b][1]) energy[b][f] += re[k] * re[k] + im[k] * im[k]
  }
  flux[f] = fl
  prev = mag
}
const at = (f: number) => (f * HOP + N / 2) / RATE

// Onsets: flux peaks above a moving median.
const onsets: { t: number; strength: number }[] = []
const W = 24
for (let f = W; f < frames - W; f++) {
  const local = Array.from(flux.subarray(f - W, f + W)).sort((a, b) => a - b)
  const median = local[W]
  const peak = flux[f] >= flux[f - 1] && flux[f] > flux[f + 1] && flux[f] > median * 1.5 + 20
  if (peak && (!onsets.length || at(f) - onsets.at(-1)!.t > 0.045)) onsets.push({ t: Number(at(f).toFixed(4)), strength: Number((flux[f] - median).toFixed(1)) })
}

// Tempo: autocorrelation of the onset envelope, 70–180 BPM, then the phase that best fits.
const env = Array.from(flux, (v, f) => Math.max(0, v - (flux[f - 1] ?? v)))
let best = { bpm: 0, score: -1 }
for (let bpm = 70; bpm <= 180; bpm += 0.05) {
  const lag = (60 / bpm) * 240
  let s = 0
  for (let f = 0; f + lag * 4 < frames; f++) s += env[f] * (env[Math.round(f + lag)] + 0.5 * env[Math.round(f + 2 * lag)] + 0.25 * env[Math.round(f + 4 * lag)])
  if (s > best.score) best = { bpm, score: s }
}
const period = 60 / best.bpm
let phase = 0, phaseScore = -1
for (let p = 0; p < period; p += 1 / 1000) {
  let s = 0
  for (const o of onsets) {
    const d = (((o.t - p) / period) % 1 + 1) % 1
    s += o.strength * Math.exp(-((Math.min(d, 1 - d) * period) ** 2) / (2 * 0.012 ** 2))
  }
  if (s > phaseScore) { phaseScore = s; phase = p }
}
const beats: number[] = []
for (let t = phase; t < duration; t += period) beats.push(Number(t.toFixed(4)))
// Downbeat: the beat class (of 4) carrying the most sub-band onset energy.
const subAt = (t: number) => energy.sub[Math.max(0, Math.min(frames - 1, Math.round(t * 240 - N / 2 / HOP)))]
const classScore = [0, 0, 0, 0]
beats.forEach((t, i) => (classScore[i % 4] += Math.log1p(subAt(t))))
const downClass = classScore.indexOf(Math.max(...classScore))
const downbeats = beats.filter((_, i) => i % 4 === downClass)

// Per film frame: band energy in dB relative to the song's loudest frame of that band.
const perFrame = Math.floor(duration * FPS)
const bandsPerFrame = Object.fromEntries(
  bandNames.map((b) => {
    const e = energy[b]
    const max = Math.max(...e)
    return [b, Array.from({ length: perFrame }, (_, i) => {
      const f = Math.min(frames - 1, Math.max(0, Math.round((i / FPS) * 240 - N / 2 / HOP)))
      return Number((10 * Math.log10(e[f] / max + 1e-12)).toFixed(1))
    })]
  }),
)

// Silences: runs of 40 ms or more under -40 dB below the song's peak RMS.
const peak = Math.max(...rms)
const silences: { from: number; to: number }[] = []
let start = -1
for (let f = 0; f < frames; f++) {
  const quiet = 20 * Math.log10(rms[f] / peak + 1e-12) < -40
  if (quiet && start < 0) start = f
  if ((!quiet || f === frames - 1) && start >= 0) {
    if (at(f) - at(start) >= 0.04) silences.push({ from: Number(at(start).toFixed(3)), to: Number(at(f).toFixed(3)) })
    start = -1
  }
}

// Sections: novelty of the band profile (2 s windows either side), strongest peaks 1.5 s apart.
const profile = (f: number) => bandNames.map((b) => Math.log10(energy[b][f] + 1e-9))
const novelty: { t: number; v: number }[] = []
const span = 240 * 1.2
for (let f = span; f < frames - span; f += 6) {
  const a = [0, 0, 0, 0], b = [0, 0, 0, 0]
  for (let k = 0; k < span; k += 4) {
    profile(f - k).forEach((v, i) => (a[i] += v))
    profile(f + k).forEach((v, i) => (b[i] += v))
  }
  novelty.push({ t: at(f), v: Math.hypot(...a.map((v, i) => (v - b[i]) / (span / 4))) })
}
const sections = novelty
  .filter((n, i) => i > 0 && i < novelty.length - 1 && n.v > novelty[i - 1].v && n.v >= novelty[i + 1].v)
  .sort((a, b) => b.v - a.v)
  .reduce<{ t: number; v: number }[]>((kept, n) => (kept.every((k) => Math.abs(k.t - n.t) > 1.5) ? [...kept, n] : kept), [])
  .slice(0, 12)
  .sort((a, b) => a.t - b.t)
  .map((n) => ({ t: Number(n.t.toFixed(3)), novelty: Number(n.v.toFixed(2)) }))

const out = {
  kind: 'shaderera.analysis/1',
  of: { path: src, sha256 },
  duration: Number(duration.toFixed(4)),
  tempo: { bpm: Number(best.bpm.toFixed(2)), period: Number(period.toFixed(5)), phase: Number(phase.toFixed(4)), downbeatClass: downClass },
  beats,
  downbeats,
  onsets,
  silences,
  sections,
  bands: { fps: FPS, unit: 'dB below the band peak', ...bandsPerFrame },
}
writeFileSync(process.argv[3] ?? 'audio/final-impact-2-end.analysis.json', `${JSON.stringify(out)}\n`)
console.log(`${src}: ${duration.toFixed(3)} s, ${best.bpm.toFixed(2)} BPM, phase ${phase.toFixed(3)} s, downbeat class ${downClass}`)
console.log(`onsets ${onsets.length}, silences ${JSON.stringify(silences)}`)
console.log(`sections ${sections.map((s) => s.t).join(', ')}`)
console.log(`downbeats ${downbeats.map((t) => t.toFixed(2)).join(' ')}`)
