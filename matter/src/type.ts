// The type layer: a 2D canvas the host composites over the matter (Shaderera's layer stack). Every
// word is data the frame already has: the time, the bar, the form, the particle count, the frame. Each
// scene names what Shaderera is doing in it, while it does it. The drops land on the time they land
// at, huge. After drop 2 the screen fills with the film's own source, and the film ends on the
// slogan under the wordmark. It is all white: no accent.

import { bar, BAR, BAR1, BEAT, clamp, DURATION, FPS, sixteenthAt, SIXTEENTH } from './clock.ts'
import { BANG, DROP2, ERA_LANDS, IMPACT, MARK, P, SILENCE } from './score.ts'

const FORM_NAMES = ['line', 'land', 'city', 'sphere', 'mark', 'knot', 'attractor', 'helix', 'rings', 'water', 'gyroid', 'phyllotaxis', 'supershape', 'flow', 'accretion disk', 'rocks']

// Not drop 2: that is the bang, and nothing covers it.
const HITS = [bar(5), P, IMPACT]

/** What each scene shows Shaderera doing, named while it does it: several things to a scene, each
 * for two beats, swapping through an ASCII scramble. */
type Caption = { from: number; to: number; items: [title: string, note: string][] }
const CAPTIONS: Caption[] = [
  { from: bar(3, 1), to: bar(4, 3), items: [['AUDIO-DRIVEN', 'the line is the song'], ['BEAT GRID', '174.3 BPM, cut on the 1/16']] },
  { from: bar(5, 1), to: bar(8, 3), items: [['PROCEDURAL WORLDS', 'noise, octave by octave'], ['NO ASSETS', 'every point is a function of t'], ['NO EDGES', 'a plane that never ends'], ['GEOLOGICAL TIME', 'one octave a beat']] },
  { from: bar(9), to: bar(11), items: [['2,096,704 PARTICLES', 'WebGPU compute'], ['DEPTH OF FIELD', 'focus, in code'], ['MOTION BLUR', 'a real shutter']] },
  { from: bar(11), to: bar(13), items: [['BLOB TRACKING', 'measured from what was drawn'], ['2D OVER 3D', 'canvas layers over the GPU'], ['LIVE DATA', 'every number here is real']] },
  { from: bar(13), to: bar(15), items: [['TRUE 3D MORPHS', 'any form into any form'], ['CAMERA AS CODE', 'dolly · roll · focus'], ['SPACE FOLDS', 'a city bent into a loop']] },
  { from: bar(15), to: bar(16), items: [['SCREEN SHADERS', 'ascii · dither · halftone · heat'], ['TIME REVERSAL', 'the future, played backwards']] },
  { from: bar(17, 1), to: bar(19), items: [['VORONOI SHATTER', 'every shard its own body'], ['SPEED HEAT', 'colour from motion'], ['EVERY SHARD TRACKED', 'id · position · velocity']] },
  { from: bar(19), to: bar(21), items: [['INFINITE ZOOM', 'detail under detail'], ['CONTOURS', 'drawn from height'], ['TOP DOWN', 'any lens, any angle']] },
  { from: bar(21), to: bar(22), items: [['WIREFRAME', 'one body, any surface'], ['VOXELS', 'quantised on the beat']] },
  { from: bar(22), to: bar(24, 2), items: [['CUSTOM WGSL', 'your shader, no ceiling'], ['GRAVITATIONAL LENSING', 'light bent in the shader'], ['ORBITAL DUST', 'Kepler, point by point'], ['HORIZON', 'occlusion in the compute']] },
  { from: BANG, to: bar(27), items: [['GLITCH', 'on the 1/16'], ['PIXEL SORT', 'row by row'], ['TIME SCRATCH', 'forwards and back every 1/8'], ['A MEDIUM A 1/16', 'ascii · heat · dither · pixels']] },
  { from: bar(27, 1), to: IMPACT, items: [['GRAVITATIONAL WAVES', 'rings through space-time'], ['SPECTRAL LIGHT', 'colour from the wave itself'], ['ONE COMPUTE PASS', 'every body, two million points']] },
  { from: bar(29, 1), to: bar(31), items: [['MATH IS THE MATERIAL', 'no models, no textures'], ['MINIMAL SURFACES', 'a gyroid, solved per point'], ['PHYLLOTAXIS', 'the golden angle'], ['SUPERSHAPES', 'symmetry on the beat']] },
]
const FEATURES = CAPTIONS.reduce((n, c) => n + c.items.length, 0)
const FIRST = CAPTIONS.map((_, i) => CAPTIONS.slice(0, i).reduce((n, c) => n + c.items.length, 0))
const SWAP = 2 * BEAT
type Layout = 'edge' | 'column' | 'spine' | 'split'
const LAYOUTS: Layout[] = ['edge', 'split', 'column', 'spine']
// The wall of source, the ending's first half: as every form flashes past at once, the screen floods
// with the code the film is, under the claim. It drops out into the song's one-beat gap, and the star
// that is left breaks into the name on black.
const WALL = bar(31)
const WALL_END = SILENCE

const pcg = (v: number) => {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0
  return ((w >>> 22) ^ w) >>> 0
}
const rnd = (v: number) => pcg(v) / 4294967296

export type TypeInfo = { form: readonly number[]; particles: number; frame: number }
export type Code = { name: string; lines: string[] }[]

const GLYPHS = '0123456789#$%&@*+=<>/\\|!?:;ABCDEFXZ'
const glyph = (v: number) => GLYPHS[pcg(v) % GLYPHS.length]

/** Each character, on each frame, is some other character more often than itself. */
const scramble = (text: string, frame: number, share: number) =>
  [...text].map((ch, i) => (rnd(frame * 131 + i * 7) < share ? glyph(frame * 977 + i * 31) : ch)).join('')

/** Text that decodes into place character by character over its first `rise` s, and scrambles away
 * over its last `fall` s; out of nothing, or, when it swaps with other text, out of ASCII noise.
 * `settled` is 1 while all of it reads. */
const decoded = (text: string, t: number, from: number, to: number, frame: number, seed: number, rise = 0.3, fall = 0.15, swap = false) => {
  const inn = (t - from) / rise, out = (to - t) / fall
  const chars = [...text].map((ch, i) => {
    if (ch === ' ') return ch
    const h = rnd(seed * 7919 + i * 13)
    if (inn > h && out > h) return ch
    return swap || (inn > h * 0.4 && out > h * 0.4) ? glyph(frame * 977 + i * 31 + seed) : ' '
  })
  return { text: chars.join(''), settled: clamp(Math.min(inn, out) - 1) > 0 ? 1 : 0 }
}

type Draw = (ctx: OffscreenCanvasRenderingContext2D, text: string, x: number, y: number) => void

/** Text cut into horizontal bands, each thrown sideways by its own amount on each frame. */
const glitched = (ctx: OffscreenCanvasRenderingContext2D, family: string, text: string, x: number, y: number, size: number, align: CanvasTextAlign, frame: number, draw: Draw, amount = 1) => {
  ctx.font = `600 ${size}px "${family}"`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const bands = 7
  const top = y - size * 0.45, h = (size * 0.9) / bands
  for (let b = 0; b < bands; b++) {
    const r = rnd(frame * 53 + b * 11)
    const shift = r < 0.45 * amount ? (rnd(frame * 17 + b * 5) - 0.5) * size * 0.35 : 0
    ctx.save()
    ctx.beginPath()
    ctx.rect(-ctx.canvas.width, top + b * h, 3 * ctx.canvas.width, h + 1)
    ctx.clip()
    draw(ctx, text, x + shift, y)
    ctx.restore()
  }
}

/** The size at which text in a face is exactly `width` wide. */
const fitWidth = (ctx: OffscreenCanvasRenderingContext2D, face: string, text: string, width: number) => {
  ctx.font = `100px ${face}`
  return (100 * width) / ctx.measureText(text).width
}

const timecode = (t: number) => {
  const s = Math.max(0, t)
  return `${String(Math.floor(s)).padStart(2, '0')}.${String(Math.floor((s % 1) * 1000)).padStart(3, '0')}`
}

/** The words that are the film's params: the slogan under the name, and the label in the corner. */
export type Copy = { slogan: string; label: string }

export const createType = (fonts: { mono: string; bold: string; italic: string }, code: Code, { slogan: SLOGAN, label }: Copy) => {
  const COOL = 'rgba(222,230,242,0.82)'
  const total = code.reduce((n, f) => n + f.lines.length, 0)

  /** The film's own source, two files side by side, scrolling and breaking up on the 1/16. */
  const wall = (ctx: OffscreenCanvasRenderingContext2D, W: number, H: number, t: number, frame: number) => {
    const size = 15, lead = 19, pad = 36
    const rows = Math.ceil((H - 2 * pad) / lead)
    const k = sixteenthAt(t)
    const built = clamp((t - WALL) / (2 * SIXTEENTH)) // rows arrive top to bottom over an 1/8…
    const gone = clamp((t - (WALL_END - BEAT)) / BEAT) // …and drop out at random over the last beat
    const colW = (W - 2 * pad) / code.length
    const chars = Math.floor((colW - 24) / (size * 0.6))
    ctx.font = `${size}px "${fonts.mono}"`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    code.forEach((file, c) => {
      // Each file scrolls at its own rate and jumps on every 1/16.
      const scroll = Math.floor((t - WALL) * (34 + 21 * c)) + k * (7 + c * 5)
      for (let r = 0; r < rows; r++) {
        if (r / rows > built || rnd(r * 977 + c * 31 + 5) < gone) continue
        const y = pad + r * lead
        const x = pad + c * colW
        const head = r === 0
        let line = head ? `// ${file.name} · ${file.lines.length} lines` : file.lines[(scroll + r) % file.lines.length]
        line = line.replace(/\t/g, '  ').slice(0, chars)
        const g = rnd(frame * 7 + r * 131 + c * 17)
        const throwX = g < 0.12 ? (rnd(frame * 3 + r) - 0.5) * 160 : 0
        if (g > 0.965 && !head) {
          // One row in thirty, the line the film is running now, lit.
          ctx.fillStyle = 'rgba(255,255,255,0.95)'
          ctx.fillRect(x - 4 + throwX, y - 2, Math.min(colW - 16, line.length * size * 0.6 + 8), lead)
          ctx.fillStyle = '#05070a'
        } else ctx.fillStyle = head ? 'rgba(255,255,255,0.95)' : `rgba(222,230,242,${0.35 + 0.35 * rnd(r * 13 + c)})`
        ctx.fillText(g < 0.3 ? scramble(line, frame + r, 0.25) : line, x + throwX, y)
      }
    })

    // The claim, cut out of the code, for as long as the wall stands.
    const from = WALL + 2 * SIXTEENTH, to = WALL_END - SIXTEENTH
    if (t >= from && t < to) {
      const lines = ['EVERYTHING', 'IS SOURCE CODE']
      const size2 = Math.round(Math.min(H * 0.105, (W * 0.86) / (Math.max(...lines.map((x) => x.length)) * 0.6)))
      ctx.font = `600 ${size2}px "${fonts.bold}"`
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + size2
      const h = size2 * 2.6
      ctx.clearRect(W / 2 - w / 2, H / 2 - h / 2, w, h)
      lines.forEach((l, i) => {
        const d = decoded(l, t, from + i * SIXTEENTH * 2, to, frame, 40 + i)
        glitched(ctx, fonts.bold, d.text, W / 2, H / 2 + (i - 0.5) * size2 * 1.1, size2, 'center', frame, (cc, text, x, y) => {
          cc.fillStyle = 'rgba(255,255,255,0.96)'
          cc.fillText(text, x, y)
        }, d.settled ? 0.25 : 1)
      })
      ctx.font = `13px "${fonts.mono}"`
      ctx.fillStyle = COOL
      ctx.textBaseline = 'top'
      const note = decoded(`this film: ${code.map((f) => f.name).join(' + ')} · ${total.toLocaleString('en-US')} lines · deterministic, frame for frame`, t, from + BEAT * 0.5, to, frame, 50)
      ctx.fillText(note.text, W / 2, H / 2 + h / 2 - 22)
    }
  }

  const WHITE = 'rgba(255,255,255,0.95)'
  const HAIR = 'rgba(222,230,242,0.45)'
  // Where captions may go. A tall frame is for Shorts and Reels, whose own controls cover its top,
  // its bottom and its right edge.
  const area = (W: number, H: number) => (H > W ? { l: W * 0.07, r: W * 0.16, t: H * 0.14, b: H * 0.25 } : { l: 36, r: 36, t: 64, b: 64 })

  /** The title's size: as big as asked, unless that would not fit. */
  const fit = (ctx: OffscreenCanvasRenderingContext2D, text: string, size: number, room: number) => {
    ctx.font = `600 ${size}px "${fonts.bold}"`
    const w = ctx.measureText(text).width
    return w > room ? (size * room) / w : size
  }
  const big = (ctx: OffscreenCanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: CanvasTextAlign, frame: number, settled: number) =>
    glitched(ctx, fonts.bold, text, x, y, size, align, frame, (cc, tx, xx, yy) => {
      cc.fillStyle = WHITE
      cc.fillText(tx, xx, yy)
    }, settled ? 0 : 1)
  const hollow = (ctx: OffscreenCanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: CanvasTextAlign, baseline: CanvasTextBaseline) => {
    ctx.font = `600 ${size}px "${fonts.bold}"`
    ctx.textAlign = align
    ctx.textBaseline = baseline
    ctx.lineWidth = 1.2
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.strokeText(text, x, y)
  }
  const small = (ctx: OffscreenCanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign, baseline: CanvasTextBaseline) => {
    ctx.font = `13px "${fonts.mono}"`
    ctx.fillStyle = COOL
    ctx.textAlign = align
    ctx.textBaseline = baseline
    ctx.fillText(text, x, y)
  }
  const serif = (ctx: OffscreenCanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: CanvasTextAlign, baseline: CanvasTextBaseline) => {
    ctx.font = `${size}px "${fonts.italic}"`
    ctx.fillStyle = 'rgba(232,238,248,0.9)'
    ctx.textAlign = align
    ctx.textBaseline = baseline
    ctx.fillText(text, x, y)
  }
  const line = (ctx: OffscreenCanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
    ctx.strokeStyle = HAIR
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }

  /** One feature, set in one of the four compositions. `u` is how far through its two beats it is. */
  const caption = (ctx: OffscreenCanvasRenderingContext2D, W: number, H: number, layout: Layout, title: string, note: string, count: string, number: string, u: number, frame: number, settled: number) => {
    const words = title.split(' ').filter(Boolean)
    const { l, r, t: top0, b } = area(W, H)
    const span = W - l - r
    const numeral = Math.min(H * 0.36, W * 0.42)
    if (layout === 'edge') {
      // A huge title along the bottom, over a ruler that the time runs along; its number hollow, top
      // right.
      const size = fit(ctx, title, H * 0.16, span)
      const y = H - b - size * 0.42
      const rule = y - size * 0.62
      hollow(ctx, number, W - r, top0 + 10, numeral, 'right', 'top')
      big(ctx, title, l - size * 0.03, y, size, 'left', frame, settled)
      line(ctx, l, rule, W - r, rule)
      for (let k = 0; k <= 32; k++) line(ctx, l + (span * k) / 32, rule, l + (span * k) / 32, rule + (k % 4 === 0 ? 9 : 4))
      ctx.fillStyle = WHITE
      ctx.fillRect(l + span * clamp(u) - 3, rule - 3, 6, 6)
      small(ctx, count, l, rule - 10, 'left', 'bottom')
      serif(ctx, note, W - r, rule - 8, 30, 'right', 'bottom')
    } else if (layout === 'column') {
      // Stacked a word to a line in the right-hand column, ranged right, with a hairline down its
      // left; its number hollow, bottom left.
      const size = Math.min(...words.map((w) => fit(ctx, w, H * 0.13, H > W ? span : W * 0.42)))
      ctx.font = `600 ${size}px "${fonts.bold}"`
      const wide = Math.max(...words.map((w) => ctx.measureText(w).width))
      const lead = size * 0.98
      const top = (top0 + H - b) / 2 - ((words.length - 1) * lead) / 2
      hollow(ctx, number, l, H - b, numeral, 'left', 'bottom')
      words.forEach((w, k) => big(ctx, w, W - r, top + k * lead, size, 'right', frame + k * 7, settled))
      const x = Math.max(l, W - r - wide - 26)
      line(ctx, x, top - lead * 0.8, x, top + (words.length - 1) * lead + lead * 0.8)
      small(ctx, count, W - r, top - lead * 0.62, 'right', 'bottom')
      serif(ctx, note, W - r, top + (words.length - 1) * lead + lead * 0.6, 30, 'right', 'top')
    } else if (layout === 'spine') {
      // Stood on its end up the left edge, read bottom to top, a hairline beside it; its number
      // hollow, right of centre.
      const size = Math.min(fit(ctx, title, H * 0.15, H - top0 - b), W * 0.2)
      const x = l + size * 0.5
      hollow(ctx, number, W - r, (top0 + H - b) / 2, numeral, 'right', 'middle')
      ctx.save()
      ctx.translate(x, H - b)
      ctx.rotate(-Math.PI / 2)
      big(ctx, title, 0, 0, size, 'left', frame, settled)
      ctx.restore()
      const rx = l + size + 18
      line(ctx, rx, top0, rx, H - b)
      small(ctx, count, rx + 14, top0, 'left', 'top')
      serif(ctx, note, rx + 14, H - b, 30, 'left', 'bottom')
    } else {
      // Split across the frame: the first word top left, the rest bottom right, joined by a
      // diagonal hairline; its number hollow, bottom left.
      const a = words.length > 1 ? words[0] : title.slice(0, Math.ceil(title.length / 2))
      const bb = words.length > 1 ? words.slice(1).join(' ') : title.slice(Math.ceil(title.length / 2))
      const room = H > W ? span : W * 0.62
      const size = Math.min(fit(ctx, a, H * 0.15, room), fit(ctx, bb, H * 0.15, room))
      const ya = top0 + size * 0.5, yb = H - b - size * 0.5
      ctx.font = `600 ${size}px "${fonts.bold}"`
      const wa = ctx.measureText(a).width, wb = ctx.measureText(bb).width
      hollow(ctx, number, l, H - b, numeral, 'left', 'bottom')
      big(ctx, a, l, ya, size, 'left', frame, settled)
      big(ctx, bb, W - r, yb, size, 'right', frame + 3, settled)
      line(ctx, l + wa + 20, ya + size * 0.4, W - r - wb - 20, yb - size * 0.4)
      small(ctx, count, l, ya + size * 0.6, 'left', 'top')
      serif(ctx, note, W - r, yb - size * 0.62, 30, 'right', 'bottom')
    }
  }

  return (ctx: OffscreenCanvasRenderingContext2D, W: number, H: number, t: number, info: TypeInfo) => {
    ctx.clearRect(0, 0, W, H)
    const pad = 36

    // The end: the slogan, under the wordmark once ERA has landed.
    if (t >= MARK) {
      const from = ERA_LANDS - 0.1
      if (t < from) return
      const d = decoded(SLOGAN, t, from, DURATION + 1, info.frame, 60)
      // As wide as the name above it: one lockup.
      const size = fitWidth(ctx, `"${fonts.mono}"`, SLOGAN, W * (H > W ? 0.88 : 0.66))
      ctx.font = `${size}px "${fonts.mono}"`
      ctx.fillStyle = 'rgba(232,238,248,0.95)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(d.text, W / 2, H * (H > W ? 0.545 : 0.58))
      return
    }

    const k = sixteenthAt(t)
    const inBar = ((k % 16) + 16) % 16
    const drop = (t >= P && t < bar(24)) || (t >= DROP2 && t < SILENCE)

    if (t >= WALL && t < WALL_END) wall(ctx, W, H, t, info.frame)


    // Data in the corners, from the first hit on. In the drops it blinks off on every 4th 1/16.
    if (t >= bar(5) && t < SILENCE && !(drop && inBar % 4 === 3)) {
      ctx.font = `13px "${fonts.mono}"`
      ctx.fillStyle = COOL
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.fillText(label, pad, pad)
      const b = (t - BAR1) / BAR
      const barN = Math.floor(b) + 1
      const beat = Math.floor((b % 1) * 4) + 1
      const six = Math.floor((b * 16) % 4) + 1
      ctx.textAlign = 'right'
      ctx.fillText(`t ${timecode(t)}`, W - pad, pad)
      ctx.fillText(`BAR ${String(barN).padStart(2, '0')}.${beat}.${six}   174.3 BPM`, W - pad, pad + 18)
      ctx.textBaseline = 'bottom'
      ctx.textAlign = 'left'
      const [a, to, m] = info.form
      const form = m > 0 && m < 1 ? `${FORM_NAMES[a]} → ${FORM_NAMES[to]}  ${m.toFixed(2)}` : FORM_NAMES[a]
      ctx.fillText(`FORM ${form.toUpperCase()}`, pad, H - pad - 18)
      ctx.fillText(`${info.particles.toLocaleString('en-US')} POINTS`, pad, H - pad)
      ctx.textAlign = 'right'
      ctx.fillText(`FRAME ${String(info.frame).padStart(4, '0')} / ${Math.round(DURATION * FPS)}`, W - pad, H - pad)
    }

    // The feature this scene shows, set somewhere new on every swap: four compositions on the frame's
    // grid, in turn, each with its number huge and hollow, a hairline, and a note in italic serif.
    CAPTIONS.forEach((c, ci) => {
      if (t < c.from || t >= c.to) return
      // Which of the scene's features, and its own two beats; the first rises out of nothing, the
      // last falls into nothing, and between them each swaps through noise.
      const n = Math.floor((t - c.from) / SWAP)
      const j = n % c.items.length
      const first = n === 0, last = c.from + (n + 1) * SWAP >= c.to - 1e-6
      const start = c.items.length === 1 ? c.from : c.from + n * SWAP
      const end = c.items.length === 1 ? c.to : Math.min(c.to, start + SWAP)
      const rise = first ? 0.3 : 0.14, fall = last ? 0.15 : 0.06, swap = c.items.length > 1 && !first
      const [titleText, noteText] = c.items[j]
      const i = FIRST[ci] + j
      const title = decoded(titleText, t, start, end, info.frame, i * 3, rise, fall, swap)
      const note = decoded(noteText, t, start + 0.05, end, info.frame, i * 3 + 2, rise, fall, swap).text
      const count = decoded(`${String(i + 1).padStart(2, '0')} / ${FEATURES}`, t, start, end, info.frame, i * 3 + 1, rise, fall, swap).text
      const number = String(i + 1).padStart(2, '0')
      caption(ctx, W, H, LAYOUTS[i % LAYOUTS.length], title.text, note, count, number, (t - start) / (end - start), info.frame, title.settled)
    })

    // The drops land on their own time, huge: solid for a 1/16, outlined for three more, its
    // characters scrambling every frame.
    for (const at of HITS) {
      const since = t - at
      if (since < 0 || since >= 4 * SIXTEENTH) continue
      const solid = since < SIXTEENTH
      glitched(ctx, fonts.bold, scramble(timecode(at), info.frame, 0.55), W / 2, H / 2, Math.round(Math.min(H * 0.42, (W * 0.94) / 3.6)), 'center', info.frame, (c, text, x, y) => {
        if (solid) {
          c.fillStyle = 'rgba(255,255,255,0.92)'
          c.fillText(text, x, y)
        } else {
          c.lineWidth = 2
          c.strokeStyle = 'rgba(255,255,255,0.8)'
          c.strokeText(text, x, y)
        }
      })
    }

    // The build's last bar counts down the 1/16s to the drop, scrambling too.
    if (t >= bar(16) && t < P) {
      const left = Math.ceil((P - t) / SIXTEENTH)
      glitched(ctx, fonts.bold, `−${scramble(String(left).padStart(2, '0'), info.frame, 0.4)}`, W - pad, H * 0.5, Math.round(H * 0.07), 'right', info.frame, (c, text, x, y) => {
        c.fillStyle = 'rgba(255,255,255,0.85)'
        c.fillText(text, x, y)
      })
    }
  }
}
