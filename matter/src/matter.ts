// MATTER (v2): the film as one body of particles that never cuts. open builds everything;
// render asks the score for the frame at t and executes it.

import type { Host, Json, Source } from '@shaderera/core'
import { BAR, BAR1, FPS } from './clock.ts'
import { createMatter, PARTICLES } from './gpu.ts'
import { lorenz } from './attractor.ts'
import { glyphPoints } from './glyph.ts'
import { type Audio, frameAt } from './score.ts'
import { createType } from './type.ts'

const SONG = 'audio/final-impact-2-end.wav'
const ANALYSIS = 'audio/final-impact-2-end.analysis.json'
const MARK_FACE = 'IBM Plex Mono SemiBold'
const TAG_FACE = 'IBM Plex Mono Regular'
const ITALIC_FACE = 'STIX Two Text Italic'
const CODE = ['src/score.ts', 'src/matter.wgsl']

const sha256 = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// The params (shaderera.json): the name lands in two parts, first then second, and the slogan
// decodes under it.
const COPY = { first: 'SHADER', second: 'ERA', slogan: 'The programmable era of ads.' }
const text = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value.trim() : fallback)

export const openMatter = async (host: Host): Promise<Source> => {
  if (!host.gpu) throw new Error('the film needs WebGPU')
  const first = text(host.params.first, COPY.first).toUpperCase()
  const second = text(host.params.second, COPY.second).toUpperCase()
  const slogan = text(host.params.slogan, COPY.slogan)
  const analysis = JSON.parse(new TextDecoder().decode(await host.io.read(ANALYSIS)))
  if (analysis.of.sha256 !== (await sha256(await host.io.read(SONG)))) throw new Error(`${ANALYSIS} was measured from other bytes than ${SONG}; run node tools/analyze-music.ts`)

  // Band energy per frame, in dB below each band's peak, read as 0–1 over the top 40 dB.
  const bands = analysis.bands as { fps: number; sub: number[]; low: number[]; mid: number[]; high: number[] }
  const level = (x: number) => Math.min(1, Math.max(0, (x + 40) / 40))
  const audio: Audio = (t) => {
    const i = Math.min(bands.sub.length - 1, Math.max(0, Math.round(t * bands.fps)))
    return [level(bands.sub[i]), level(bands.low[i]), level(bands.mid[i]), level(bands.high[i])]
  }

  await host.io.font('assets/fonts/IBMPlexMono-SemiBold.ttf', MARK_FACE)
  await host.io.font('assets/fonts/IBMPlexMono-Regular.ttf', TAG_FACE)
  await host.io.font('assets/fonts/STIXTwoText-Italic[wght].ttf', ITALIC_FACE)
  const logo = glyphPoints(host, MARK_FACE, first, second)
  const { width: W, height: H } = host.manifest
  const typeCanvas = host.io.canvas(W, H)
  const typeCtx = typeCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D
  // The film's own source, which the type layer shows: everything on screen is this code.
  const code = await Promise.all(CODE.map(async (name) => ({ name, lines: new TextDecoder().decode(await host.io.read(name)).split('\n').filter((l) => l.trim()) })))
  const drawType = createType({ mono: TAG_FACE, bold: MARK_FACE, italic: ITALIC_FACE }, code, { slogan, label: `${first}${second} / MATTER` })
  const matter = await createMatter(host, host.gpu, logo.points, logo.split, lorenz(), TAG_FACE)

  return {
    async render(t, options) {
      const f = frameAt(t, audio, W / H)
      const color = matter.render(f, options.frame)
      drawType(typeCtx, W, H, t, { form: f.pops[0][1].form, particles: PARTICLES, frame: options.frame })
      // Two layers, composited by the host: the matter, and the type over it.
      return [
        { color, alpha: 'opaque', name: 'matter' },
        { color: typeCanvas, name: 'type' },
      ]
    },
    async inspect(t) {
      const f = frameAt(t, audio, W / H)
      const s = f.pops[0][1]
      return {
        film: 'matter',
        t,
        bar: Number((1 + (t - BAR1) / BAR).toFixed(3)),
        particles: PARTICLES,
        form: s.form,
        octaves: s.terrain[0],
        zoom: s.zoom,
        bend: s.bend,
        shard: s.shard[0],
        collapse: s.morph[3],
        shares: f.shares,
        look: f.post.look,
        tracking: f.track.share,
        fps: FPS,
      } as Json
    },
    async audio() {
      return [{ src: SONG, at: 0 }]
    },
    dispose() {
      matter.dispose()
    },
  }
}
