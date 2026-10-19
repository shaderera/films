// The score of MATTER, cut to "Final Impact" from its bar 3 (174.3 BPM, bar 3 at 0.446 s; its ending is given a hall
// by tools/cut-song.ts). What the matter is, where the camera is, how it is lit, painted, broken, copied
// and tracked, as continuous tracks over the film. Nothing cuts: every change is the matter changing,
// on the song's grid.
//
// The story: from a signal, to matter, to a star.
// SIGNAL        bars 3–4   a point, then the song's waveform
// FIELD, LAND   bars 5–8   the first hit tips the signal into a field, which takes a wave; octaves
//                          settle on it a beat at a time, like geological time
// CIVILISATION  bars 9–16  a city grows on the land, is watched, folds over itself into a loop (a
//                          tunnel), and meets its own future coming back (TENET)
// BREAKING      bars 17–18 the world shatters; an instrument tracks every piece; the debris streams
// SCALE         bars 19–21 down into the land, octave under octave, until it is information (voxels)
// COLLAPSE      bars 22–23 gravity: everything spirals in to a disk, and a black hole forms at its heart
// HORIZON       bar 24     the black hole: cold light bent round it, rocks tumbling in; then all of it
//                          falls in
// INSIDE        bars 25–28 past the horizon the medium breaks down: the loop again, time scratched;
//                          then gravitational waves
// EMERGENCE     bars 29–31 from the waves, structure: a minimal surface, growth, form
// STAR          bar 32     every form at once, faster, until in the song's one-beat gap it is one star
// SUPERNOVA     bars 32–33 the cadence's first three hits crack the star; the fourth breaks it, and
//                          its pieces become the name while the hall rings out; then silence

import { bar, BEAT, BAR, clamp, DURATION, sinceSixteenth, sixteenthAt, SIXTEENTH } from './clock.ts'
import type { Cam, Frame, Post, Spec, Tracking, V3 } from './gpu.ts'

type Ease = (u: number) => number
const linear: Ease = (u) => u
const smooth: Ease = (u) => u * u * (3 - 2 * u)
const strike: Ease = (u) => 1 - (1 - u) ** 4
const accel: Ease = (u) => u * u * u
const glide: Ease = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2)
const hold: Ease = (u) => (u < 1 ? 0 : 1)

type Key<T> = [t: number, v: T, ease?: Ease]
const lerp = (a: number, b: number, u: number) => a + (b - a) * u

/** A value held between keys and eased into each key from the one before. */
const track = (keys: Key<number>[]) => (t: number) => {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, ease = smooth] = keys[i]
    const [t0, v0] = keys[i - 1]
    if (t < t1) return lerp(v0, v1, ease(clamp((t - t0) / Math.max(t1 - t0, 1e-6))))
  }
  return keys[keys.length - 1][1]
}
const track3 = (keys: Key<V3>[]) => {
  const axis = (i: number) => track(keys.map(([t, v, e]) => [t, v[i], e]))
  const x = axis(0), y = axis(1), z = axis(2)
  return (t: number): V3 => [x(t), y(t), z(t)]
}
const between = (t: number, a: number, b: number) => t >= a && t < b

const deg = Math.PI / 180
const SIZE = 40
const TUNNEL = (2 * Math.PI) / SIZE
const AXIS = SIZE / (2 * Math.PI) // the tunnel's axis height
export const P = bar(17) // drop 1: TENET's two populations meet here, and the sphere breaks
export const DROP2 = bar(25)
// Drop 2 is a bang: for its first two beats the matter only flies out of the point it fell into.
export const BANG = DROP2 + 2 * BEAT
export const IMPACT = bar(29)
export const SILENCE = bar(32, 2) // the song's one-beat gap before its cadence
export const CRACKS = [bar(32, 3), bar(33), bar(33, 1)] // the cadence's first three hits
export const MARK = bar(33, 2) // its fourth and last
// The name comes as SHADER first; then, once the hall has gone quiet, ERA: it is the era of shaders.
export const ERA = bar(34, 3)
export const ERA_LANDS = bar(35, 2)

export const FORM = { line: 0, land: 1, city: 2, sphere: 3, glyph: 4, knot: 5, attractor: 6, helix: 7, rings: 8, water: 9, gyroid: 10, phyllo: 11, supershape: 12, flow: 13, disk: 14, rocks: 15 } as const

// ---- form ----------------------------------------------------------------------------------------

type Morph = { t: number; d: number; to: number; stagger: number; width: number; turbulence: number; steps?: number; ease?: Ease }

/** Bar 32 up to the gap: the form changes every 6 frames, then every 3; each change a whole morph. */
const lastRush = (): Morph[] => {
  const cycle = [FORM.gyroid, FORM.phyllo, FORM.city, FORM.supershape, FORM.flow, FORM.rings, FORM.sphere, FORM.land, FORM.disk]
  const out: Morph[] = []
  let t = bar(32)
  let k = 0
  for (const [until, every] of [[bar(32, 1), 6 / 60], [SILENCE, 3 / 60]] as const) {
    while (t < until - 1e-6) {
      out.push({ t, d: every * 0.8, to: cycle[k++ % cycle.length], stagger: k % 3, width: 1, turbulence: 0.8, ease: strike })
      t += every
    }
  }
  return out
}

const morphs: Morph[] = [
  { t: 0, d: 0, to: FORM.line, stagger: 0, width: 0, turbulence: 0 },
  { t: bar(5), d: 1.2, to: FORM.land, stagger: 1, width: 1.6, turbulence: 0.5, ease: strike },
  { t: bar(9), d: 2 * BAR, to: FORM.city, stagger: 2, width: 2.2, turbulence: 0, steps: 16 },
  { t: bar(16), d: P - bar(16) - 2 * SIXTEENTH, to: FORM.sphere, stagger: 3, width: 1.4, turbulence: 2.5, ease: glide },
  { t: bar(18), d: 2 * BEAT, to: FORM.flow, stagger: 3, width: 1.4, turbulence: 2, ease: strike },
  { t: bar(19), d: BAR, to: FORM.land, stagger: 2, width: 1.2, turbulence: 0.5, ease: glide },
  { t: bar(21), d: BAR * 0.75, to: FORM.city, stagger: 0, width: 1.5, turbulence: 0, steps: 12 },
  { t: bar(22), d: 1.5 * BAR, to: FORM.disk, stagger: 2, width: 1.6, turbulence: 0.6, ease: glide },
  { t: bar(24, 3.96), d: 0.01, to: FORM.city, stagger: 0, width: 0, turbulence: 0 },
  { t: bar(27), d: 2 * BEAT, to: FORM.rings, stagger: 2, width: 1.2, turbulence: 1.8, ease: strike },
  { t: IMPACT, d: 2 * BEAT, to: FORM.gyroid, stagger: 0, width: 1.4, turbulence: 2.2, ease: strike },
  { t: bar(30), d: 2 * BEAT, to: FORM.phyllo, stagger: 2, width: 1.2, turbulence: 2, ease: strike },
  { t: bar(31), d: BEAT, to: FORM.supershape, stagger: 1, width: 1.2, turbulence: 1.6, ease: strike },
  ...lastRush(),
  { t: SILENCE, d: BEAT, to: FORM.sphere, stagger: 2, width: 1.4, turbulence: 2, ease: strike },
  { t: MARK, d: 5 * BEAT, to: FORM.glyph, stagger: 0, width: 1.6, turbulence: 0, ease: glide },
]

const formAt = (t: number, list = morphs) => {
  let from: number = list[0].to
  for (let i = 1; i < list.length; i++) {
    const m = list[i]
    if (t < m.t) break
    if (t < m.t + m.d) {
      let u = clamp((t - m.t) / m.d)
      if (m.steps) {
        const k = Math.floor(u * m.steps), f = u * m.steps - k
        u = (k + strike(clamp(f * 3))) / m.steps
      } else u = (m.ease ?? smooth)(u)
      return { form: [from, m.to, u, m.stagger] as Spec['form'], width: m.width, turbulence: m.turbulence }
    }
    from = m.to
  }
  return { form: [from, from, 0, 0] as Spec['form'], width: 0, turbulence: 0 }
}

// ---- the sheet, the land, the city, the bends ------------------------------------------------------

// One octave arrives on each beat of bars 6–7.
const octaveKeys: Key<number>[] = [[0, 0], [bar(6), 0], [bar(6) + 0.01, 1]]
for (let k = 0; k < 8; k++) octaveKeys.push([bar(6) + k * BEAT, k + 1], [bar(6) + k * BEAT + 0.09, k + 2, strike])
const octaves = track(octaveKeys)
const height = track([[0, 1.2], [bar(6), 1.2], [bar(8), 4.2], [bar(19), 4.2], [bar(19, 2), 2.2], [bar(24, 3.9), 2.2], [DROP2, 4.2]])
const ridge = track([[0, 0], [bar(7), 0], [bar(8, 2), 1]])
const warp = track([[0, 0], [bar(7), 0], [bar(8, 2), 0.45], [bar(19), 0.45], [bar(19, 1), 0]])
const zoom = track([[0, 0], [bar(19, 2), 0], [bar(21), 1.6, glide], [bar(22), 2.6, linear]])
// The plane has no edge until the tunnel needs it to be a square.
const layout = track([[0, 1], [bar(13), 1], [bar(13, 2), 0]])
// Where the fan starts: just behind the camera, which moves in from z 46 to z 3 over bars 5–12.
const fanZ = track([[0, 50], [bar(6, 2), 50], [bar(7), 15], [bar(9), 15], [bar(11), 9]])
const foldK = track([[0, 0], [bar(12), 0], [bar(12, 2), Math.PI / 15, strike], [bar(13), Math.PI / 15], [bar(13, 2), 0]])
// The tunnel exists twice: bars 13–16 and drop 2. The switches happen while the matter is another form
// or a point, so they are never seen.
const wrapK = track([
  [0, 0], [bar(13), 0], [bar(13, 3), TUNNEL, glide], [P - 0.06, TUNNEL], [P - 0.05, 0, linear],
  [bar(24, 3.96), 0], [bar(24, 3.98), TUNNEL, linear], [bar(27, 2), TUNNEL], [bar(27, 2.1), 0, linear],
])
const windows = track([[0, 0], [bar(9), 0], [bar(11), 1], [P, 1], [P + 0.2, 0], [bar(24, 3.96), 0], [DROP2, 1], [bar(27), 1], [bar(27, 2), 0]])
const ripple = (t: number) => (t < bar(5) || t > bar(7) ? 0 : 1.6 * Math.exp(-(t - bar(5)) / 0.9))
const lineReveal = track([[0, 0], [bar(3), 0], [bar(3, 2), 1, strike]])

// Shatter: on the drop the sphere breaks in waves a 1/16 apart; then the shards become knots.
const shardTime = (t: number) => {
  if (t >= CRACKS[0]) return starShards(t)
  if (t < P) return 0
  if (t < bar(18)) return (t - P) * 1.15
  const flown = (bar(18) - P) * 1.15
  return flown * (1 - accel(clamp((t - bar(18)) / (2 * BEAT))))
}
// Copies: five supershapes in emergence.
const kaleido = track([[0, 0], [bar(31), 0], [bar(31, 1), 1, strike], [bar(32), 1], [bar(32, 0.5), 0]])
const voxCell = (t: number) => (between(t, bar(21, 2), bar(22)) ? 0.55 : between(t, bar(26), bar(27)) ? 0.7 : 0)
// The supershape's symmetry steps on every beat of bar 31.
const superM = (t: number): [number, number] => {
  const k = Math.max(0, Math.min(3, Math.floor((t - bar(31)) / BEAT)))
  return [[3, 5, 7, 12][k], [2, 4, 3, 6][k]]
}

// Into the hole through the second half of bar 24, which shrinks as it swallows everything, to one
// bright point; out of it again on drop 2, an explosion that takes two beats to spend itself.
const collapse = track([
  [0, 0], [bar(24, 2), 0], [bar(24, 3.85), 1, accel], [DROP2, 1], [BANG, 0, strike],
])
// The black hole forms through the collapse and is gone as everything falls in.
const holeR = (t: number) => (t >= bar(24, 3.95) ? 0 : track([[0, 0], [bar(22, 2), 0], [bar(23, 2), 0.8], [bar(24), 3.2, strike], [bar(24, 2), 3.2], [bar(24, 3.65), 0, accel]])(t))
// The mark: its letters arrive a little off their plane and settle into it.
const scatter = track([[0, 60], [MARK, 6], [MARK + 5 * BEAT, 0.6, glide], [MARK + 8 * BEAT, 0.3]])
const eraAway = track([[0, 1], [ERA, 1], [ERA_LANDS, 0, strike]])
// In the gap everything is a small bright star. Each of the cadence's first three hits cracks it a
// little further open; the last breaks it, and its pieces fly out and come back down onto the letters
// as the morph to the mark carries them.
const starR = track([[0, 8], [SILENCE, 8], [SILENCE + BEAT, 2.6, strike]])
const CRACKED = 0.16
const cracks = track([[0, 0], ...CRACKS.flatMap((x, i): Key<number>[] => [[x, (CRACKED * i) / 3], [x + 0.12, (CRACKED * (i + 1)) / 3, strike]])])
const starShards = (t: number) => {
  if (t < MARK) return cracks(t)
  const u = clamp((t - MARK) / (4.5 * BEAT))
  return CRACKED * (1 - u) + 1.5 * Math.sin(Math.PI * u) ** 0.6
}

// ---- camera ----------------------------------------------------------------------------------------

type Shot = { eye: V3; target: V3; fov: number; roll: number }
const shot = (eye: V3, target: V3 = [0, 0, 0], fov = 44, roll = 0): Shot => ({ eye, target, fov, roll })
const camKeys: Key<Shot>[] = [
  // SIGNAL: the line seen edge-on; it is a plane, which the sub tips toward us.
  [0, shot([0, 0, 46], [0, 0, 0], 34)],
  [bar(5), shot([0, 0, 46], [0, 0, 0], 34)],
  [bar(5, 2), shot([0, 13, 34], [0, 0, 0], 44), strike],
  [bar(6), shot([0, 9, 24], [0, 0, -4], 50)],
  [bar(7), shot([6, 4, 12], [-2, 1.5, -10], 56, 0.1)],
  [bar(8), shot([-5, 3, 4], [2, 1, -16], 60, -0.15)],
  // CIVILISATION: up over the city as it grows; down into its streets; up as it folds; into the loop.
  [bar(9), shot([0, 11, 14], [0, 0, -6], 54), strike],
  [bar(11), shot([3, 2.4, 6], [-1, 1.5, -12], 62, 0.08)],
  [bar(12), shot([1.5, 2.1, 3.6], [-1, 1.5, -15], 64, 0.14), linear],
  [bar(12, 2), shot([15, 4, 10], [0, 6, -8], 58, -0.1), strike],
  [bar(13), shot([12, 2.5, 3], [0, 10, -8], 64, -0.15)],
  [bar(13, 3), shot([0, AXIS, 14], [0, AXIS, -10], 72, 0.6)],
  [bar(15), shot([0, AXIS, 6], [0, AXIS, -24], 76, 1.0), linear],
  [bar(16), shot([0, AXIS, 3], [0, AXIS, -28], 78, 1.6), linear],
  [bar(16, 2), shot([8, 10, 30], [0, 0, 0], 44), glide],
  [bar(16, 3.5), shot([0, 4, 22], [0, 0, 0], 42)],
  // III
  [P, shot([0, 3, 19], [0, 0, 0], 44)],
  [bar(17, 2), shot([-30, 10, 30], [0, 0, 0], 46, -0.2), strike],
  [bar(18), shot([16, -4, 26], [0, 2, 0], 58, 0.1), strike],
  [bar(19), shot([-12, 6, 20], [0, 3, 0], 62, -0.1), linear],
  [bar(19, 1), shot([0, 34, 0.4], [0, 0, 0], 46), strike],
  [bar(20), shot([0, 24, 0.3], [0, 0, 0], 50, 1.2), linear],
  [bar(21), shot([0, 15, 0.2], [0, 0, 0], 54, 2.4), linear],
  [bar(22), shot([0, 11, 0.2], [0, 0, 0], 56, 3.2), linear],
  // COLLAPSE: up and out as it all spirals in, then down to the disk's plane, where the bent light shows.
  [bar(23), shot([0, 30, 18], [0, 0, 0], 50, 0.6), glide],
  [bar(24), shot([0, 14, 36], [0, 0, 0], 44)],
  [bar(24, 1), shot([0, 2.6, 30], [0, 0, 0], 40, 0.06), strike],
  [bar(24, 2), shot([5, 3, 28], [0, 0, 0], 38, -0.03), linear],
  [bar(24, 3.9), shot([1.2, 0.9, 15], [0, 0, 0], 34, 0), accel],
  // V
  // INSIDE: the bang, face on, the world flying out of the point at us; then into the loop.
  [bar(24, 3.95), shot([0, 0.6, 15], [0, 0, 0], 62), linear],
  [DROP2 + BEAT, shot([0, 0.8, 17], [0, 0.2, 0], 64), linear],
  [bar(26), shot([0, AXIS, 12], [0, AXIS, -16], 74, 1.2), glide],
  [bar(26, 2), shot([0, AXIS, 4], [0, AXIS, -30], 80, 2.6), linear],
  [bar(27), shot([0, AXIS, -2], [0, AXIS, -30], 82, 3.4), linear],
  [bar(27, 2), shot([0, AXIS, 26], [0, AXIS, -20], 70, 4.4), strike],
  [bar(28), shot([0, AXIS, 18], [0, AXIS, -20], 74, 5.4), linear],
  [bar(28, 3), shot([18, 14, 30], [0, 0, 0], 50), strike],
  // VI: close round the gyroid; straight down on the seeds; face on to the supershapes; then pull out.
  [IMPACT, shot([10, 6, 20], [0, 0, 0], 56, 0.2)],
  [bar(29, 3), shot([-14, -4, 16], [0, 0, 0], 60, -0.3), linear],
  [bar(30), shot([0, 30, 0.3], [0, 0, 0], 50), strike],
  [bar(30, 3.5), shot([0, 24, 0.2], [0, 0, 0], 54, 2.2), linear],
  [bar(31), shot([0, 2, 36], [0, 0, 0], 62), strike],
  [bar(32), shot([0, 2, 30], [0, 0, 0], 64, 1.4), linear],
  [SILENCE, shot([0, 2, 34], [0, 0, 0], 58, 1.6), linear],
  [SILENCE + BEAT, shot([0, 0.6, 40], [0, 0, 0], 34, 0), strike],
  // SUPERNOVA: in on the star as it cracks; as its pieces become the mark the camera backs away to
  // frame it, and then all but stops.
  [MARK, shot([0, 0.4, 35], [0, 0, 0], 34), linear],
  [MARK + 5 * BEAT, shot([0, 0, 160], [0, 0, 0], 11), glide],
  [ERA_LANDS, shot([0, -1.9, 164], [0, -1.9, 0], 10.4), glide],
  [DURATION, shot([0, -1.9, 166], [0, -1.9, 0], 10.3), linear],
]
const cam = {
  eye: track3(camKeys.map(([t, v, e]) => [t, v.eye, e])),
  target: track3(camKeys.map(([t, v, e]) => [t, v.target, e])),
  fov: track(camKeys.map(([t, v, e]) => [t, v.fov, e])),
  roll: track(camKeys.map(([t, v, e]) => [t, v.roll, e])),
}
// The shots are made for 16:9. A taller frame keeps them by opening the lens: half way, on a log scale,
// between keeping the height (and losing the sides) and keeping the width. For the ending it opens
// three quarters of the way, so that the name, on one line, spans the frame's width.
const LANDSCAPE = 16 / 9
const opening = track([[0, 0.5], [SILENCE, 0.5], [MARK, 0.75]])
const widen = (fov: number, aspect: number, t: number) => (aspect >= LANDSCAPE ? fov : 2 * Math.atan(Math.tan(fov / 2) * (LANDSCAPE / aspect) ** opening(t)))
const camAt = (t: number, aspect: number): Cam => ({ eye: cam.eye(t), target: cam.target(t), fov: widen(cam.fov(t) * deg, aspect, t), roll: cam.roll(t) })
const coc = track([[0, 0], [bar(5), 0], [bar(6), 1.2], [P, 1.5], [bar(17, 3), 5], [bar(18), 1.2], [bar(21), 3], [bar(24), 1], [DROP2, 2.5], [IMPACT, 4], [bar(30), 1.5], [MARK, 1.5], [MARK + 3 * BEAT, 0]])

// ---- light -----------------------------------------------------------------------------------------

const keyAz = track([[0, -70], [bar(7), -40], [bar(11), 20], [P, 120], [bar(19), -60], [DROP2, 60], [IMPACT, 150], [bar(30), -30], [MARK, -35]])

export type Audio = (t: number) => [number, number, number, number]

/** Population A, the main body, at t. */
export const specAt = (t: number, audio: Audio, aspect = LANDSCAPE): Spec => {
  const c = camAt(t, aspect)
  const { form, width, turbulence } = formAt(t)
  const a = audio(t)
  const focus = Math.hypot(c.eye[0] - c.target[0], c.eye[1] - c.target[1], c.eye[2] - c.target[2])
  const drops = between(t, P, bar(24)) || between(t, DROP2, SILENCE)
  // The key light strobes on every 1/16 of the drops; elsewhere it breathes with the sub.
  const strobe = drops ? 2.2 * Math.exp(-sinceSixteenth(t) / 0.03) : 0
  const az = keyAz(t)
  return {
    cam: c,
    focus,
    coc: coc(t),
    exposure: between(t, P, bar(18)) ? 0.5 : between(t, bar(22, 2), DROP2) ? 0.45 : 1,
    solidity: 0.85,
    emission: 2.5,
    form,
    morph: [width, turbulence, 1.7, collapse(t)],
    line: [lineReveal(t), 1.8 + 1.5 * a[3], 9, t * 7],
    terrain: [octaves(t), height(t), warp(t), SIZE],
    city: [1.25, 1.0, 6, windows(t)],
    bend: [-2, foldK(t), wrapK(t), ridge(t)],
    sphere: [starR(t), 0.12, t * 0.2, 0],
    shard: [shardTime(t), 22, 7, 4],
    glyph: [scatter(t), 34, 0, eraAway(t)],
    world: [0, 0, 0, 1],
    key: [az, 14, 2.6 + strobe + a[0] * 0.6],
    rim: [az + 170, 20, 1.4],
    mat: [0.32, 0.75, 0.004, 0],
    misc: [t, ripple(t), (t - bar(5)) * 16, 0],
    zoom: zoom(t),
    audio: a,
    trail: form[0] === FORM.attractor || form[1] === FORM.attractor || form[0] === FORM.flow ? 3 : 0,
    paint: [0, 0, 1, 0],
    glitch: [0, 24, 0, 0],
    vox: [voxCell(t), SIXTEENTH, 4, 2.5],
    knot: [3, 7, 2.6, 0.55],
    rep: between(t, bar(30, 3), MARK) ? [5, 1, 12, 0.85] : [6, 1, 9, 0.62],
    extra: [0.035, 0.5, 260, 0],
    rep2: [kaleido(t), t * 0.8],
    sheet: [layout(t), 85, fanZ(t)],
    shape2: [...superM(t), 7, 6000],
    hole: [holeR(t), 4.4, 64, t * 2.6],
  }
}

// ---- looks, glitch, tracking ---------------------------------------------------------------------

/** Which 1/16 of the film t is in, and which of its bar (0–15). */
const pos = (t: number) => {
  const k = sixteenthAt(t)
  return { k, inBar: ((k % 16) + 16) % 16 }
}

const LOOK = { none: 0, ascii: 1, halftone: 2, dither: 3, heat: 4, contours: 5, pixels: 6, inverse: 7 } as const

const lookAt = (t: number): Post['look'] => {
  const { k, inBar } = pos(t)
  // CIVILISATION: in the build's riser the medium flickers, every 1/4, then 1/8, then 1/16.
  if (between(t, bar(15), P)) {
    const every = t < bar(16) ? 4 : t < bar(16, 2) ? 2 : 1
    const step = Math.floor(k / every)
    const pick = [LOOK.none, LOOK.dither, LOOK.none, LOOK.halftone, LOOK.none, LOOK.heat, LOOK.none, LOOK.ascii]
    return [pick[step % pick.length], 1, 8]
  }
  // III: the dive is drawn as contours, the voxel city as pixels.
  if (between(t, bar(20), bar(21))) return [LOOK.contours, 0.85, 8]
  if (between(t, bar(21, 2), bar(22))) return inBar % 2 === 0 ? [LOOK.pixels, 1, 10] : [LOOK.none, 0, 8]
  // V: a new medium on every 1/16 except each beat's first, which shows the matter as it is.
  if (between(t, BANG, bar(28))) {
    if (inBar % 4 === 0) return [LOOK.none, 0, 8]
    const pick = [LOOK.ascii, LOOK.heat, LOOK.dither, LOOK.halftone, LOOK.pixels, LOOK.contours]
    return [pick[k % pick.length], 1, 9]
  }
  // VI: the phyllotaxis as halftone dots on every other 1/8; the last rush inverts on alternate 1/16s.
  if (between(t, bar(30), bar(31)) && Math.floor(k / 2) % 2 === 1) return [LOOK.halftone, 1, 7]
  if (between(t, bar(32), SILENCE)) return [[LOOK.none, LOOK.inverse][k % 2], 1, 8]
  return [LOOK.none, 0, 8]
}

const rowsAt = (t: number): Post['rows'] => {
  const { k, inBar } = pos(t)
  // Fill moments: the last beat before each hit, every 1/16 of it.
  for (const n of [4, 8, 12, 16, 23, 28]) if (between(t, bar(n, 3), bar(n + 1))) return [0.45, k, 0.5, 0.18]
  if (between(t, P, bar(24)) || between(t, BANG, SILENCE)) return inBar % 4 === 3 ? [0.3, k, 0.5, 0.12] : [0, 0, 0, 0]
  return [0, 0, 0, 0]
}

const scrambleAt = (t: number): Spec['glitch'] => {
  const { k } = pos(t)
  if (between(t, bar(15), P)) return [0.35 * clamp((t - bar(15)) / (P - bar(15))) ** 2, 24, k, 0]
  if (between(t, BANG, bar(27))) return [0.2, 24, k, 0]
  if (between(t, bar(32), SILENCE)) return [0.3, 16, k, 0]
  return [0, 24, 0, 0]
}

/** Each scene's paint: what the colour is made of. */
const paintAt = (t: number): Spec['paint'] => {
  if (between(t, P, bar(18))) return [1, 0.8, 9, 0] // shards: heat of their own speed
  if (between(t, bar(18), bar(19))) return [1, 0.9, 12, 0] // strands: heat of their own speed
  if (between(t, bar(19), bar(20))) return [6, 0.9, 1.4, 0] // the dive: contour lines of height
  if (between(t, bar(21), bar(21, 2))) return [7, 0.9, 64, 0] // the city as wireframe
  if (between(t, DROP2, bar(27))) return [3, 0.55, 1.4, t * 0.3] // tunnel: spectral
  if (between(t, bar(27), IMPACT)) return [3, 0.8, 1.0, t * 0.4] // gravitational waves: spectral
  if (between(t, IMPACT, bar(30))) return [2, 0.75, 0.09, 0] // gyroid: steel, contoured by depth
  if (between(t, bar(30), bar(31))) return [9, 0.9, 1, 0] // seeds: duotone
  if (between(t, bar(31), bar(32))) return [7, 0.9, 48, 0] // supershapes: wireframe
  if (between(t, bar(32), SILENCE)) return [[1, 5, 6, 7, 8, 9][sixteenthAt(t) % 6], 0.9, 3, t] as Spec['paint']
  if (between(t, bar(22), DROP2)) return [10, 0.95, 9, 0.05] // the disk: cold heat of its own orbit
  return [0, 0, 1, 0]
}

const ACCENT: [number, number, number] = [1, 0.24, 0.06]
const NO_TRACKING: Tracking = { share: 0, seed: 0, least: 8, links: 0, accent: ACCENT, opacity: 0, box: [2.0, 14, 150], acquire: 1, arrow: 0, inside: 0, labels: 1 }

/** Tracking: a scene's things, found when it begins (the brackets close in) and followed through it. */
const tracked = (t: number, from: number, x: Partial<Tracking>): Tracking => ({
  ...NO_TRACKING,
  opacity: 1,
  acquire: strike(clamp((t - from) / (2 * SIXTEENTH))),
  ...x,
})

const trackingAt = (t: number): Tracking => {
  // CIVILISATION: the tracker wakes on the city's blocks in its streets, and follows them as it folds.
  if (between(t, bar(11), bar(13, 2))) return tracked(t, bar(11), { share: 0.55, seed: 8, least: 3, links: 0.35, box: [1.1, 8, 70], arrow: 3, labels: 7 })
  // BREAKING, SCALE: the shards, with their speeds; the blocks of the land.
  if (between(t, P, bar(18))) return tracked(t, P, { share: 0.6, seed: 11, least: 2, links: 0.35, box: [2.0, 8, 90], arrow: 4, labels: 9 })
  if (between(t, bar(19, 2), bar(21))) return tracked(t, bar(19, 2), { share: 0.5, seed: 13, least: 3, links: 0.3, box: [1.0, 8, 70], arrow: 3, labels: 11 })
  // HORIZON: the rocks falling round the hole.
  if (between(t, bar(24, 1), bar(24, 3.6))) return tracked(t, bar(24, 1), { share: 0.3, seed: 18, least: 2, links: 0.35, box: [2.0, 8, 90], arrow: 5, labels: 8 })
  // INSIDE: the scratched shards.
  if (between(t, BANG, bar(27))) return tracked(t, BANG, { share: 0.6, seed: 19, least: 2, links: 0.35, box: [1.6, 8, 90], arrow: 4, labels: 9 })
  // EMERGENCE: the five forms.
  if (between(t, bar(31, 1), bar(32))) return tracked(t, bar(31, 1), { share: 1, seed: 25, least: 20, links: 0.7, box: [1.8, 30, 260], arrow: 2 })
  return NO_TRACKING
}

// ---- the other populations -------------------------------------------------------------------------

/** Inside the horizon, the second body: the broken world, its time scratched forwards and back every
 * 1/8. */
const shardsAt = (t: number, own: Spec): Spec => {
  const eighth = 2 * SIXTEENTH
  const u = ((t - DROP2) / eighth) % 2
  const scratch = 0.6 + 0.9 * (u < 1 ? u : 2 - u)
  return {
    ...own,
    form: [FORM.sphere, FORM.sphere, 0, 0],
    morph: [0, 0, 2.3, own.morph[3]],
    shard: [scratch, 22, 7, 4],
    world: [0, AXIS * (1 - own.morph[3]), -16 * (1 - own.morph[3]), 1],
    bend: [-2, 0, 0, own.bend[3]],
    paint: [1, 0.85, 9, 0],
    mat: [own.mat[0], own.mat[1], own.mat[2], 1],
    vox: [0, SIXTEENTH, 3.2, own.vox[3]],
    rep2: [0, 0],
  }
}

/** Inside the horizon, the third body: the name's points, scattered through the loop, streaming past. */
const typeAt = (t: number, own: Spec): Spec => {
  const fly = ((t - DROP2) * 18) % 60
  return {
    ...own,
    form: [FORM.glyph, FORM.glyph, 0, 0],
    glyph: [90, 60, 0, 0],
    world: [0, AXIS * (1 - own.morph[3]), (fly - 40) * (1 - own.morph[3]), 1],
    paint: [0, 0, 1, 0],
    emission: 4,
    vox: [0, SIXTEENTH, 4, 0],
    rep2: [0, 0],
  }
}

const SHUTTER = 1 / 120

export const frameAt = (t: number, audio: Audio, aspect = LANDSCAPE): Frame => {
  const at = (x: number) => specAt(x, audio, aspect)
  const times = [t - SHUTTER, t] as const
  const a = times.map(at) as [Spec, Spec]
  for (const s of a) {
    s.glitch = scrambleAt(t)
    s.paint = paintAt(t)
  }
  const pops: [Spec, Spec][] = [a]
  let shares = [1]
  // TENET (bar 16): half the matter is the drop's explosion running backwards into the sphere.
  if (between(t, bar(16), P)) {
    const mirror = (x: number, own: Spec): Spec => ({ ...at(2 * P - x), cam: own.cam, focus: own.focus, coc: own.coc, key: own.key, rim: own.rim, mat: [own.mat[0], own.mat[1], own.mat[2], 1], glitch: own.glitch, paint: [1, 0.6, 9, 0] })
    pops.push([mirror(times[0], a[0]), mirror(times[1], a[1])])
    shares = [0.5, 0.5]
  }
  // In the loop: meteors flying down it at us.
  if (between(t, bar(13), bar(16, 1))) {
    const meteors = (own: Spec): Spec => ({ ...own, form: [FORM.rocks, FORM.rocks, 0, 0], world: [0, AXIS, 0, 1], hole: [-1, 0, 46, 0], coc: 0, paint: [8, 0.9, 1, 0], morph: [0, 0, 0, 0], glitch: [0, 24, 0, 0], emission: 3.2 })
    pops.push([meteors(a[0]), meteors(a[1])])
    shares = pops.length === 3 ? [0.36, 0.36, 0.28] : [0.7, 0.3]
  }
  // The black hole: the disk and, round it, the rocks.
  if (between(t, bar(24), bar(24, 3.95))) {
    const rocks = (own: Spec): Spec => ({ ...own, form: [FORM.rocks, FORM.rocks, 0, 0], paint: [0, 0, 1, 0], morph: [0, 0, 0, own.morph[3]], glitch: [0, 24, 0, 0] })
    pops.push([rocks(a[0]), rocks(a[1])])
    shares = [0.75, 0.25]
  }
  // DROP 2: three bodies at once.
  if (between(t, DROP2, bar(27))) {
    pops.push([shardsAt(times[0], a[0]), shardsAt(times[1], a[1])], [typeAt(times[0], a[0]), typeAt(times[1], a[1])])
    shares = [0.6, 0.25, 0.15]
  }
  const flash = Math.max(t >= DROP2 ? 0.5 * Math.exp(-(t - DROP2) / 0.05) : 0, ...[bar(5), P, IMPACT, ...CRACKS, MARK].map((x) => (t >= x ? 0.12 * Math.exp(-(t - x) / 0.03) : 0)))
  return {
    pops,
    shares,
    post: { exposure: 1, bloom: 0.5, flash, vignette: 0.35, grain: 0.02, look: lookAt(t), rows: rowsAt(t), lens: a[1].hole[0] > 0 ? 0.9 : 0 },
    track: trackingAt(t),
  }
}
