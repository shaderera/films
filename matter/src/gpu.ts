// Executes a frame of MATTER: two compute passes (place every particle, then splat its light and
// measure blobs), a resolve into HDR, post (looks, glitch), and the tracking overlay. Everything is
// created in createMatter (called from open).

import type { Host } from '@shaderera/core'
import { mat4, vec3, vec4 } from 'wgpu-matrix'
import { LOGO_POINTS } from './glyph.ts'

export const SIDE = 1448
export const PARTICLES = SIDE * SIDE
export const POPULATIONS = 4
const STATE_FLOATS = 16 + 4 * 31 // matter.wgsl's State: a matrix and 31 vec4s, 560 bytes
const BLOBS = 2048
const BLOB_STRIDE = 8

export type V3 = [number, number, number]
export type Cam = { eye: V3; target: V3; fov: number; roll: number }

/** One population's scene at one instant: everything matter.wgsl's State holds, by name. */
export type Spec = {
  cam: Cam
  focus: number
  coc: number
  exposure: number
  solidity: number
  emission: number
  form: [a: number, b: number, morph: number, stagger: number]
  morph: [width: number, turbulence: number, seed: number, collapse: number]
  line: [reveal: number, amp: number, freq: number, phase: number]
  terrain: [octaves: number, height: number, warp: number, size: number]
  city: [cell: number, height: number, levels: number, windows: number]
  bend: [foldZ0: number, foldK: number, wrapK: number, ridge: number]
  sphere: [radius: number, displacement: number, spin: number, unused: number]
  shard: [time: number, cells: number, speed: number, spin: number]
  glyph: [scatter: number, width: number, cx: number, eraAway: number]
  world: [x: number, y: number, z: number, scale: number]
  key: [azimuth: number, elevation: number, intensity: number]
  rim: [azimuth: number, elevation: number, intensity: number]
  mat: [roughness: number, metal: number, fog: number, tint: number]
  misc: [noiseTime: number, ripple: number, ripplePhase: number, contour: number]
  zoom: number
  audio: [sub: number, low: number, mid: number, high: number]
  trail: number
  /** Colour mode (0 steel, 1 speed heat, 2 depth contours, 3 spectral, 4 accent), amount, scale, offset. */
  paint: [mode: number, amount: number, scale: number, offset: number]
  /** Share of blocks scrambled, blocks per side, seed, unused. */
  glitch: [share: number, blocks: number, seed: number, unused: number]
  /** Voxel cell (0 off), shard delay unit (s), helix radius, rings amplitude. */
  vox: [cell: number, shardDelay: number, helixRadius: number, rings: number]
  /** Torus knot p, q, radius, tube. */
  knot: [p: number, q: number, radius: number, tube: number]
  /** Copies, mode (0 none, 1 kaleidoscope, 2 grid, 3 ring), spacing, scale. */
  rep: [copies: number, mode: number, spacing: number, scale: number]
  /** Attractor flow, attractor scale, water size, reflection. */
  extra: [flow: number, attractorScale: number, waterSize: number, reflection: number]
  /** How far into the copies (0 one form, 1 all copies), spin. */
  rep2: [amount: number, spin: number]
  /** Sheet layout (0 square, 1 a fan with no edge), reach, fan origin z. */
  sheet: [layout: number, reach: number, originZ: number]
  /** Supershape symmetries m1, m2; gyroid cell; phyllotaxis seeds. */
  shape2: [m1: number, m2: number, gyroidCell: number, seeds: number]
  /** Black hole at the origin: horizon radius (0 none), disk inner and outer radius, spin (radians so far). */
  hole: [radius: number, inner: number, outer: number, spin: number]
}

export type Post = {
  exposure: number
  bloom: number
  flash: number
  vignette: number
  grain: number
  /** 0 none, 1 ascii, 2 halftone, 3 dither, 4 heat, 5 contours, 6 pixels, 7 inverse. */
  look: [mode: number, amount: number, cell: number]
  /** Share of rows thrown, seed, share of those sorted, throw (fraction of the width). */
  rows: [share: number, seed: number, sorted: number, shift: number]
  /** Gravitational lensing round the black hole: strength (0 none). Its place on screen is measured. */
  lens: number
}

export type Tracking = {
  /** Share of the blobs shown (0: tracking off), seed (which ones), least particles counted. */
  share: number
  seed: number
  least: number
  links: number
  accent: [number, number, number]
  opacity: number
  /** Half size of a box in standard deviations, and its least and most half size in pixels. */
  box: [sigmas: number, least: number, most: number]
  /** 0 just found (the brackets are wide and faint), 1 locked on. */
  acquire: number
  /** Velocity arrow length per pixel of motion over the shutter. */
  arrow: number
  /** Inside a box: 0 nothing, 1 heat, 2 contours, 3 inverse. */
  inside: number
  /** A callout on every nth blob only (1: all). */
  labels: number
}

export type Frame = {
  /** Up to four populations, each at the shutter's start and end. */
  pops: [Spec, Spec][]
  /** Each population's share of the particles; they sum to 1. */
  shares: number[]
  post: Post
  track: Tracking
}

const dirOf = (azimuth: number, elevation: number) => {
  const a = (azimuth * Math.PI) / 180, e = (elevation * Math.PI) / 180
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]
}

// Roll turns the frame about the line of sight. Looking straight down, "up" on screen is far (−z).
const upOf = (c: Cam) => {
  const f = vec3.normalize(vec3.subtract(c.target, c.eye))
  const k = Math.min(1, Math.max(0, (Math.abs(f[1]) - 0.85) / 0.13))
  const ref = vec3.normalize([0, 1 - k * k * (3 - 2 * k), -k * k * (3 - 2 * k)])
  const right = vec3.normalize(vec3.cross(f, ref))
  const up = vec3.cross(right, f)
  return vec3.add(vec3.scale(up, Math.cos(c.roll)), vec3.scale(right, Math.sin(c.roll)))
}

export const viewProj = (c: Cam, aspect: number) => {
  const view = mat4.lookAt(c.eye, c.target, upOf(c))
  const distance = vec3.distance(c.eye, c.target)
  const projection = mat4.perspective(c.fov, aspect, Math.max(0.01, distance * 0.002), distance * 40 + 200)
  return mat4.multiply(projection, view)
}

const pack = (out: Float32Array, at: number, s: Spec, aspect: number, pop: number, share: number) => {
  const put = (offset: number, v: ArrayLike<number>) => out.set(v, at + offset)
  put(0, viewProj(s.cam, aspect))
  put(16, [...s.cam.eye, s.focus])
  put(20, [s.coc, s.exposure, s.solidity, s.emission])
  put(24, s.form)
  put(28, s.morph)
  put(32, s.line)
  put(36, s.terrain)
  put(40, s.city)
  put(44, s.bend)
  put(48, s.sphere)
  put(52, s.shard)
  put(56, s.glyph)
  put(60, s.world)
  put(64, [...dirOf(s.key[0], s.key[1]), s.key[2]])
  put(68, [...dirOf(s.rim[0], s.rim[1]), s.rim[2]])
  put(72, s.mat)
  put(76, s.misc)
  put(80, [s.zoom, 0, 0, 0])
  put(84, s.audio)
  put(88, [s.trail, 0, 0, 0])
  put(92, [1 / Math.tan(s.cam.fov / 2), 0, 0, 0])
  put(96, s.paint)
  put(100, s.glitch)
  put(104, [pop, share > 0 ? 1 / share : 1, 0, 0])
  put(108, s.vox)
  put(112, s.knot)
  put(116, s.rep)
  put(120, s.extra)
  put(124, [...s.rep2, 0, 0])
  put(128, [...s.sheet, 0])
  put(132, s.shape2)
  put(136, s.hole)
}

/** The printable ASCII range in a 16 × 6 grid of 10 × 18 cells, white on black, for tags and ASCII. */
const asciiAtlas = (host: Host, family: string) => {
  const canvas = host.io.canvas(160, 108)
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 160, 108)
  ctx.fillStyle = '#fff'
  ctx.font = `15px "${family}"`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (let c = 32; c < 128; c++) ctx.fillText(String.fromCharCode(c), (c % 16) * 10 + 5, Math.floor((c - 32) / 16) * 18 + 9.5)
  return new Uint8Array(ctx.getImageData(0, 0, 160, 108).data)
}

export const createMatter = async (host: Host, device: GPUDevice, logo: Float32Array, logoSplit: number, attractor: Float32Array, tagFace: string) => {
  const { width: W, height: H } = host.manifest
  const decoder = new TextDecoder()
  const code = async (name: string) => decoder.decode(await host.io.read(`src/${name}`))
  const matter = device.createShaderModule({ code: await code('matter.wgsl') })
  const post = device.createShaderModule({ code: await code('post.wgsl') })
  const track = device.createShaderModule({ code: await code('track.wgsl') })

  const S = GPUBufferUsage.STORAGE, D = GPUBufferUsage.COPY_DST, U = GPUBufferUsage.UNIFORM
  const globals = device.createBuffer({ size: 48, usage: U | D })
  const states = device.createBuffer({ size: 2 * POPULATIONS * STATE_FLOATS * 4, usage: S | D })
  const logoBuffer = device.createBuffer({ size: logo.byteLength, usage: S | D })
  device.queue.writeBuffer(logoBuffer, 0, logo)
  const attractorBuffer = device.createBuffer({ size: attractor.byteLength, usage: S | D })
  device.queue.writeBuffer(attractorBuffer, 0, attractor)
  const points = device.createBuffer({ size: PARTICLES * 48, usage: S })
  const depth = device.createBuffer({ size: W * H * 4, usage: S | D })
  const light = device.createBuffer({ size: W * H * 12, usage: S | D })
  const blobs = device.createBuffer({ size: BLOBS * BLOB_STRIDE * 4, usage: S | D })
  const postBuffer = device.createBuffer({ size: 80, usage: U | D })
  const trackBuffer = device.createBuffer({ size: 64, usage: U | D })

  const RA = GPUTextureUsage.RENDER_ATTACHMENT, TB = GPUTextureUsage.TEXTURE_BINDING
  const hdr = device.createTexture({ size: [W, H], format: 'rgba16float', usage: RA | TB })
  const gw = Math.round(W / 4), gh = Math.round(H / 4)
  const bright = device.createTexture({ size: [gw, gh], format: 'rgba16float', usage: RA | TB })
  const blurred = device.createTexture({ size: [gw, gh], format: 'rgba16float', usage: RA | TB })
  const out = device.createTexture({ size: [W, H], format: 'rgba8unorm', usage: RA | TB | GPUTextureUsage.COPY_SRC })
  const atlas = device.createTexture({ size: [160, 108], format: 'rgba8unorm', usage: TB | GPUTextureUsage.COPY_DST })
  device.queue.writeTexture({ texture: atlas }, asciiAtlas(host, tagFace), { bytesPerRow: 160 * 4 }, [160, 108])
  const hdrView = hdr.createView(), brightView = bright.createView(), blurView = blurred.createView(), outView = out.createView()
  const atlasView = atlas.createView()
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })

  const evaluate = device.createComputePipeline({ layout: 'auto', compute: { module: matter, entryPoint: 'evaluate' } })
  const splat = device.createComputePipeline({ layout: 'auto', compute: { module: matter, entryPoint: 'splat' } })
  const tri: GPUPrimitiveState = { topology: 'triangle-list' }
  const resolve = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: matter, entryPoint: 'fullVs' },
    fragment: { module: matter, entryPoint: 'resolveFs', targets: [{ format: 'rgba16float' }] },
    primitive: tri,
  })
  const full = (entryPoint: string, format: GPUTextureFormat) =>
    device.createRenderPipeline({ layout: 'auto', vertex: { module: post, entryPoint: 'fullVs' }, fragment: { module: post, entryPoint, targets: [{ format }] }, primitive: tri })
  const brightPipe = full('brightFs', 'rgba16float')
  const blurX = full('blurXFs', 'rgba16float')
  const blurY = full('blurYFs', 'rgba16float')
  const finalPipe = full('finalFs', 'rgba8unorm')
  const over: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  }
  const trackLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  })
  const overlay = (vs: string, fs: string) =>
    device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [trackLayout] }),
      vertex: { module: track, entryPoint: vs },
      fragment: { module: track, entryPoint: fs, targets: [{ format: 'rgba8unorm', blend: over }] },
      primitive: tri,
    })
  const linkPipe = overlay('linkVs', 'linkFs')
  const boxPipe = overlay('boxVs', 'boxFs')

  const buf = (buffer: GPUBuffer) => ({ buffer })
  const evaluateGroup = device.createBindGroup({
    layout: evaluate.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: buf(globals) },
      { binding: 1, resource: buf(states) },
      { binding: 2, resource: buf(logoBuffer) },
      { binding: 3, resource: buf(points) },
      { binding: 4, resource: buf(depth) },
      { binding: 8, resource: buf(attractorBuffer) },
    ],
  })
  const splatGroup = device.createBindGroup({
    layout: splat.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: buf(globals) },
      { binding: 3, resource: buf(points) },
      { binding: 4, resource: buf(depth) },
      { binding: 5, resource: buf(light) },
      { binding: 7, resource: buf(blobs) },
    ],
  })
  const resolveGroup = device.createBindGroup({
    layout: resolve.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: buf(globals) },
      { binding: 6, resource: buf(light) },
    ],
  })
  const read = (p: GPURenderPipeline, view: GPUTextureView) =>
    device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 1, resource: view }, { binding: 2, resource: sampler }] })
  const brightGroup = read(brightPipe, hdrView)
  const blurXGroup = read(blurX, brightView)
  const blurYGroup = read(blurY, blurView)
  const finalGroup = device.createBindGroup({
    layout: finalPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: buf(postBuffer) },
      { binding: 1, resource: hdrView },
      { binding: 2, resource: sampler },
      { binding: 3, resource: brightView },
      { binding: 4, resource: atlasView },
    ],
  })
  const trackGroup = device.createBindGroup({
    layout: trackLayout,
    entries: [
      { binding: 0, resource: buf(globals) },
      { binding: 1, resource: buf(trackBuffer) },
      { binding: 2, resource: buf(blobs) },
      { binding: 3, resource: atlasView },
      { binding: 4, resource: hdrView },
    ],
  })

  const stateData = new Float32Array(2 * POPULATIONS * STATE_FLOATS)
  const aspect = W / H

  const render = (f: Frame, frame: number) => {
    // Populations beyond those given repeat the first, with no share.
    let cumulative = 0
    const edges: number[] = []
    for (let p = 0; p < POPULATIONS; p++) {
      const pair = f.pops[p] ?? f.pops[0]
      const share = f.shares[p] ?? 0
      pack(stateData, (2 * p) * STATE_FLOATS, pair[0], aspect, p, share)
      pack(stateData, (2 * p + 1) * STATE_FLOATS, pair[1], aspect, p, share)
      cumulative += share
      edges.push(cumulative)
    }
    device.queue.writeBuffer(states, 0, stateData)
    device.queue.writeBuffer(globals, 0, new Float32Array([W, H, frame, PARTICLES, edges[0], edges[1], edges[2], SIDE, LOGO_POINTS, logoSplit, 0, 0]))
    const p = f.post
    // Where the black hole (the world origin) is on screen, and how big its horizon is there.
    const a1 = f.pops[0][1]
    const clip = vec4.transformMat4([0, 0, 0, 1], viewProj(a1.cam, aspect))
    const hx = (clip[0] / clip[3] * 0.5 + 0.5) * W, hy = (0.5 - clip[1] / clip[3] * 0.5) * H
    const hr = clip[3] > 0 ? (a1.hole[0] * H * 0.5) / (Math.tan(a1.cam.fov / 2) * clip[3]) : 0
    device.queue.writeBuffer(postBuffer, 0, new Float32Array([
      p.exposure, p.bloom, frame, p.flash,
      p.vignette, p.grain, 0.15, 0,
      p.look[0], p.look[1], p.look[2], 0,
      p.rows[0], p.rows[1], p.rows[2], p.rows[3],
      hx, hy, hr, a1.hole[0] > 0 && clip[3] > 0 ? p.lens : 0,
    ]))
    const t = f.track
    device.queue.writeBuffer(trackBuffer, 0, new Float32Array([
      t.share, t.seed, t.least, t.links,
      ...t.accent, t.opacity,
      ...t.box, t.acquire,
      t.arrow, t.inside, p.exposure, t.labels,
    ]))

    const encoder = device.createCommandEncoder()
    encoder.clearBuffer(depth)
    encoder.clearBuffer(light)
    encoder.clearBuffer(blobs)
    const groups = Math.ceil(PARTICLES / 256)
    const c = encoder.beginComputePass()
    c.setPipeline(evaluate)
    c.setBindGroup(0, evaluateGroup)
    c.dispatchWorkgroups(groups)
    c.setPipeline(splat)
    c.setBindGroup(0, splatGroup)
    c.dispatchWorkgroups(groups)
    c.end()
    const pass = (pipeline: GPURenderPipeline, group: GPUBindGroup, view: GPUTextureView) => {
      const r = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] })
      r.setPipeline(pipeline)
      r.setBindGroup(0, group)
      r.draw(3)
      r.end()
    }
    pass(resolve, resolveGroup, hdrView)
    pass(brightPipe, brightGroup, brightView)
    pass(blurX, blurXGroup, blurView)
    pass(blurY, blurYGroup, brightView)
    pass(finalPipe, finalGroup, outView)
    if (t.share > 0 && t.opacity > 0) {
      const r = encoder.beginRenderPass({ colorAttachments: [{ view: outView, loadOp: 'load', storeOp: 'store' }] })
      r.setBindGroup(0, trackGroup)
      if (t.links > 0) {
        r.setPipeline(linkPipe)
        r.draw(6, BLOBS)
      }
      r.setPipeline(boxPipe)
      r.draw(6, BLOBS)
      r.end()
    }
    device.queue.submit([encoder.finish()])
    return out
  }

  const dispose = () => {
    for (const x of [hdr, bright, blurred, out, atlas]) x.destroy()
    for (const b of [globals, states, logoBuffer, attractorBuffer, points, depth, light, blobs, postBuffer, trackBuffer]) b.destroy()
  }
  return { render, dispose }
}
