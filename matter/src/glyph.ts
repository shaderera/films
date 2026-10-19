// The wordmark as a point set: first + second (SHADER + ERA by default) rasterised once in open, and
// LOGO_POINTS points picked from its filled pixels with a fixed hash. Coordinates are in word widths:
// x in [-0.5, 0.5], y up. `split` is where first ends and second begins, in the same units.
// The face is a stand-in (IBM Plex Mono SemiBold, OFL) until Shaderera has a mark of its own.

import type { Host } from '@shaderera/core'

export const LOGO_POINTS = 1 << 18

const pcg = (v: number) => {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0
  return ((w >>> 22) ^ w) >>> 0
}
const rnd = (v: number) => pcg(v) / 4294967296

export const glyphPoints = (host: Host, family: string, first: string, second: string) => {
  const WORDMARK = first + second
  const W = 4096, H = 760
  const canvas = host.io.canvas(W, H)
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#fff'
  ctx.font = `620px "${family}"`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(WORDMARK, W / 2, H / 2)
  const data = ctx.getImageData(0, 0, W, H).data
  const filled: number[] = []
  let x0 = W, x1 = 0
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (data[(y * W + x) * 4] > 127) {
        filled.push(y * W + x)
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
      }
  if (!filled.length) throw new Error(`the wordmark face "${family}" drew nothing`)
  const width = x1 - x0 + 1, cx = (x0 + x1 + 1) / 2
  const left = W / 2 - ctx.measureText(WORDMARK).width / 2
  const split = (left + ctx.measureText(first).width - cx) / width
  const points = new Float32Array(LOGO_POINTS * 2)
  for (let i = 0; i < LOGO_POINTS; i++) {
    const p = filled[Math.floor(rnd(i * 3) * filled.length)]
    const px = (p % W) + rnd(i * 3 + 1), py = Math.floor(p / W) + rnd(i * 3 + 2)
    points[i * 2] = (px - cx) / width
    points[i * 2 + 1] = (H / 2 - py) / width
  }
  return { points, aspect: width / H, split }
}
