import type { Open } from '@shaderera/core'

/**
 * wallloom's end card, on white: the wordmark over "ANY ART, FRAME, SIZE, ANYWHERE". The line
 * parts before its last word, a small framed piece pops into the gap and changes on every half
 * beat, then the gap widens to a row of five, pushing "ANYWHERE" out, and at the end the row
 * closes and the line joins again. Timing, type and mouldings follow the opening film's ending
 * (D:/shaderera/wallloom-art-opening, src/film/ending.ts); the pictures are public-domain paintings
 * from the Art Institute of Chicago (ASSETS.md).
 */

export const COPY = {
  id: 'copy',
  wordmark: 'wallloom',
  before: 'ANY ART, FRAME, SIZE,',
  after: 'ANYWHERE',
}

/** In beats of the opening film's music, 100.05 BPM, from the first frame. */
export const BEATS = {
  id: 'beats',
  bpm: 100.05,
  single: 1.2,
  swapEvery: 0.5,
  swaps: 6,
  rowStep: 0.14,
  row: 5,
  close: [8.2, 8.8] as [number, number],
}

/** Sizes and places as parts of the opening film's 804 px frame height, scaled by width. */
export const TYPE = {
  id: 'type',
  background: '#FFFFFF',
  ink: '#1f1f1f',
  wordmark: { family: 'DM Sans Light', size: 0.2, tracking: -0.03, y: 0.53 },
  tagline: { family: 'DM Sans Regular', size: 0.075, tracking: 0.06, y: 0.68 },
}

/** wallloom's mouldings, in the products' colours; a trim is a fine inner line. */
export const MOULDINGS: { swatch: string; trim?: string }[] = [
  { swatch: '#d4a94f' }, // Gallery Gold
  { swatch: '#c39a6b' }, // Grainline Solid Oak
  { swatch: '#2c2c2e' }, // Outline Black
  { swatch: '#28282a', trim: '#c8ccd0' }, // Crest Black with Silver Trim
  { swatch: '#ecebe8' }, // Alcove Shadow Box White
  { swatch: '#8a5a35' }, // teak
  { swatch: '#b8bcc0' }, // silver
  { swatch: '#d9c4a0' }, // Grainline Solid Ash
  { swatch: '#74301f' }, // Gallery Reddish Brown
  { swatch: '#c8a050' }, // Outline Gold
]

/** The paintings in the order they appear: six singles, then the last single and four more. */
export const PICTURES = ['80607', '24645', '87479', '16568', '27992', '28560', '64818', '81558', '20684', '14598']

const FONTS = [
  ['assets/fonts/DMSans-Light.ttf', 'DM Sans Light'],
  ['assets/fonts/DMSans-Regular.ttf', 'DM Sans Regular'],
] as const

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const span = (x: number, a: number, b: number) => clamp01((x - a) / (b - a))
const out5 = (u: number) => 1 - (1 - u) ** 5
const outBack = (u: number, k = 1.2) => 1 + (k + 1) * (u - 1) ** 3 + k * (u - 1) ** 2

type Item = { pic: number; swatch: string; trim?: string; scale: number }

/** The pieces in the gap at beat b, and how far the line is open. */
function endingAt(b: number): { items: Item[]; open: number } {
  const B = BEATS
  if (b < B.single) return { items: [], open: 0 }
  const rowFrom = B.single + B.swaps * B.swapEvery
  const shut = 1 - out5(span(b, B.close[0], B.close[1]))
  const pick = (k: number) => ({ pic: k % PICTURES.length, ...MOULDINGS[k % MOULDINGS.length]! })
  if (b < rowFrom) {
    // One piece, popping in, then a new frame and picture on every half beat, each with a kick.
    const k = Math.floor((b - B.single) / B.swapEvery)
    const pop = outBack(span(b, B.single, B.single + 0.35), 1.6)
    const kick = 1 + 0.08 * (1 - span(b - B.single - k * B.swapEvery, 0, 0.2))
    return { items: [{ ...pick(k), scale: Math.max(0, pop) * (k ? kick : 1) }], open: span(b, B.single, B.single + 0.3) }
  }
  // The row: five pieces pop in one after another and push the last word out.
  const items: Item[] = []
  for (let i = 0; i < B.row; i++) {
    const s0 = rowFrom + i * B.rowStep
    const pop = i === 0 ? 1 : Math.max(0, outBack(span(b, s0, s0 + 0.35), 1.6))
    items.push({ ...pick(B.swaps - 1 + i), scale: pop * shut })
  }
  return { items, open: shut }
}

const open: Open = async (host) => {
  const { io, manifest } = host
  for (const [path, family] of FONTS) await io.font(path, family)
  const { width: W, height: H } = manifest
  const copy = { ...COPY, ...(host.params as Partial<typeof COPY>) }
  // Upright frames (9:16) set the tagline on two lines: the gap and its pieces open before
  // "ANYWHERE" on the second.
  const upright = H > W
  // The opening film's frame height, at this frame's width; upright, as large as the widest row
  // allows (fitted once the pictures are loaded).
  let u = (804 / 1920) * W
  const yOf = (y: number) => H / 2 + (y - 0.5) * u

  const thumbs: { c: OffscreenCanvas; w: number; h: number }[] = []
  for (const id of PICTURES) {
    if (!io.image) throw new Error('This film needs io.image to decode its paintings.')
    const img = await io.image(`assets/art/aic-${id}.jpg`)
    const c = io.canvas(img.width, img.height)
    const g = c.getContext('2d') as unknown as CanvasRenderingContext2D
    const data = g.createImageData(img.width, img.height)
    data.data.set(img.data)
    g.putImageData(data, 0, 0)
    thumbs.push({ c, w: img.width, h: img.height })
  }

  {
    // Every line at its widest (the full row, the line open) at u = 1, so long params shrink the
    // type to fit instead of running off the frame. Upright is always fitted, as large as the
    // widest line allows; landscape keeps its size unless a line would pass the edge.
    const probe = io.canvas(8, 8).getContext('2d') as unknown as CanvasRenderingContext2D
    const width = (text: string, st: { family: string; size: number; tracking: number }) => {
      probe.font = `100px "${st.family}"`
      return [...text].reduce((a, c) => a + (probe.measureText(c).width / 100) * st.size + st.tracking * st.size, 0)
    }
    const st = TYPE.tagline
    const itemH = st.size * 1.6
    let row = 0
    for (let i = 0; i < BEATS.row; i++) {
      const th = thumbs[(BEATS.swaps - 1 + i) % PICTURES.length]!
      row += itemH * 0.62 * (th.w / th.h) + 2 * itemH * 0.19
    }
    row += (BEATS.row - 1) * itemH * 0.24 + 2 * itemH * 0.32
    const mark = width(copy.wordmark, TYPE.wordmark)
    const before = width(copy.before, st)
    const after = width(copy.after, st)
    if (upright) u = Math.min(0.62 * W, (0.92 * W) / Math.max(row + after, before, mark))
    else u = Math.min(u, (0.96 * W) / Math.max(before + width(' ', st) + row + after, mark))
  }

  const frame = io.canvas(W, H)
  const ctx = frame.getContext('2d') as unknown as CanvasRenderingContext2D
  type St = { family: string; size: number; tracking: number }

  /** A run's width with its tracking. */
  const tracked = (text: string, st: St) => {
    const px = st.size * u
    ctx.font = `${px}px "${st.family}"`
    return [...text].reduce((a, c) => a + ctx.measureText(c).width + st.tracking * px, 0) - st.tracking * px
  }
  const drawTracked = (text: string, st: St, x: number, y: number) => {
    const px = st.size * u
    ctx.font = `${px}px "${st.family}"`
    for (const c of text) {
      ctx.fillText(c, x, y)
      x += ctx.measureText(c).width + st.tracking * px
    }
  }

  /** The tagline at beat b: its two parts' places and the framed pieces in the gap between them. */
  const layout = (b: number) => {
    const e = endingAt(b)
    const st = TYPE.tagline
    const px = st.size * u
    const itemH = px * 1.6
    const sizes = e.items.map((it) => {
      const th = thumbs[it.pic]!
      const ih = itemH * 0.62
      const iw = ih * (th.w / th.h)
      const pad = itemH * 0.19
      return { it, th, iw, ih, pad, w: (iw + 2 * pad) * it.scale, full: iw + 2 * pad }
    })
    const between = itemH * 0.24 * e.open
    const row = sizes.reduce((a, s) => a + s.w, 0) + Math.max(0, sizes.length - 1) * between
    ctx.font = `${px}px "${st.family}"`
    const space = ctx.measureText(' ').width
    const margin = itemH * 0.32 * e.open
    const gap = space + (row > 0 ? row + 2 * margin : 0)
    const wA = tracked(copy.before, st)
    const wB = tracked(copy.after, st)
    if (upright) {
      // Two lines: the first part alone, then the gap and the last word, each centred.
      const open = row > 0 ? row + 2 * margin : 0
      const x2 = W / 2 - (open + wB) / 2
      const y = yOf(st.y)
      return { e, x0: W / 2 - wA / 2, xB: x2 + open, wA, wB, rowX: x2 + (open - row) / 2, between, sizes, y, y2: y + px * 2.1, px }
    }
    const x0 = W / 2 - (wA + gap + wB) / 2
    const y = yOf(st.y)
    return { e, x0, xB: x0 + wA + gap, wA, wB, rowX: x0 + wA + (gap - row) / 2, between, sizes, y, y2: y, px }
  }

  const beatAt = (t: number) => (t * BEATS.bpm) / 60

  return {
    render: async (t) => {
      const L = layout(beatAt(t))
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = TYPE.background
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = TYPE.ink
      const wm = TYPE.wordmark
      drawTracked(copy.wordmark, wm, W / 2 - tracked(copy.wordmark, wm) / 2, yOf(wm.y))
      ctx.fillStyle = TYPE.ink
      drawTracked(copy.before, TYPE.tagline, L.x0, L.y)
      drawTracked(copy.after, TYPE.tagline, L.xB, L.y2)
      // The framed pieces: moulding, mat, picture, a soft shadow; each scaled about its middle.
      const cy = L.y2 - L.px * 0.36
      let x = L.rowX
      for (const s of L.sizes) {
        if (s.it.scale > 0.001) {
          const k = s.it.scale
          const cx = x + s.w / 2
          const fw = s.full * k
          const fh = (s.ih + 2 * s.pad) * k
          const left = cx - fw / 2
          const top = cy - fh / 2
          ctx.save()
          ctx.shadowColor = 'rgba(0,0,0,0.22)'
          ctx.shadowBlur = 0.5 * L.px
          ctx.shadowOffsetY = 0.12 * L.px
          ctx.fillStyle = s.it.swatch
          ctx.fillRect(left, top, fw, fh)
          ctx.restore()
          const mould = s.pad * 0.42 * k
          if (s.it.trim) {
            ctx.strokeStyle = s.it.trim
            ctx.lineWidth = Math.max(1, mould * 0.18)
            ctx.strokeRect(left + mould * 0.7, top + mould * 0.7, fw - mould * 1.4, fh - mould * 1.4)
          }
          ctx.fillStyle = '#f4f1ea'
          ctx.fillRect(left + mould, top + mould, fw - 2 * mould, fh - 2 * mould)
          ctx.drawImage(s.th.c, left + s.pad * k, top + s.pad * k, s.iw * k, s.ih * k)
        }
        x += s.w + L.between
      }
      return { color: frame, name: 'End card' }
    },
    inspect: async (t) => {
      const b = beatAt(t)
      const L = layout(b)
      const wm = TYPE.wordmark
      const ww = tracked(copy.wordmark, wm)
      const box = (x: number, y: number, w: number, size: number) => [Math.round(x), Math.round(y - size * 0.8), Math.round(w), Math.round(size)]
      return {
        id: 'end-card',
        beat: Math.round(b * 100) / 100,
        open: Math.round(L.e.open * 1000) / 1000,
        pieces: L.sizes.map((s) => ({ painting: PICTURES[s.it.pic]!, moulding: s.it.swatch, scale: Math.round(s.it.scale * 1000) / 1000 })),
        text: [
          { id: 'wordmark', text: copy.wordmark, box: box(W / 2 - ww / 2, yOf(wm.y), ww, wm.size * u) },
          { id: 'tagline-1', text: copy.before, box: box(L.x0, L.y, L.wA, L.px) },
          { id: 'tagline-2', text: copy.after, box: box(L.xB, L.y2, L.wB, L.px) },
        ],
        beats: BEATS,
      }
    },
  }
}

export default open
