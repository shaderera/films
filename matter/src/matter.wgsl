// MATTER: every image in the film is the same particles. Particle i owns a coordinate q in the unit
// square; each form is a procedural function of q, and a morph is the same q moving from one form to
// the next. The particles are dealt into four populations, each with its own scene (two states: the
// start and end of the shutter), so up to four forms, times or looks share the frame. Light is
// summed as integers with atomics, so the frame does not depend on the order the GPU adds it in.
// The splat also measures blobs (where groups of visible particles are on screen) for tracking.

struct State {
  vp: mat4x4f,
  eye: vec4f,      // xyz, focus distance
  lens: vec4f,     // coc px per unit, exposure, solidity, emission gain
  form: vec4f,     // A, B, morph, stagger mode
  morph: vec4f,    // stagger width, turbulence, seed, collapse
  line: vec4f,     // reveal, amp, freq, phase
  terrain: vec4f,  // octaves, height, warp, size
  city: vec4f,     // cell, height, levels, windows
  bend: vec4f,     // fold z0, fold k, wrap k, ridge
  sphere: vec4f,   // radius, displacement, spin, 0
  shard: vec4f,    // time, cells, speed, spin
  glyph: vec4f,    // scatter, width, cx, ERA still away (1) or landed (0)
  world: vec4f,    // offset, scale
  key: vec4f,      // direction, intensity
  rim: vec4f,      // direction, intensity
  mat: vec4f,      // roughness, metal, fog, tint (0 cool, 1 warm)
  misc: vec4f,     // noise time, ripple, ripple phase, contour
  zoom: vec4f,     // log2 zoom, slit, gallery, 0
  audio: vec4f,    // sub, low, mid, high
  trail: vec4f,    // decay along the shutter (0: even motion blur), 0, 0, 0
  lensExtra: vec4f, // 1 / tan(fov / 2), 0, 0, 0
  paint: vec4f,    // colour mode (0 steel, 1 speed heat, 2 depth contours, 3 spectral, 4 accent), amount, scale, offset
  glitch: vec4f,   // share of blocks scrambled, blocks per side, seed, block throw
  pop: vec4f,      // this population's index, 1 / its share, 0, 0
  vox: vec4f,      // voxel cell (0 off), shard delay unit (s), helix radius, rings amplitude
  knot: vec4f,     // torus knot p, q, radius, tube
  rep: vec4f,      // copies, mode (0 none, 1 kaleidoscope about the view axis z, 2 grid, 3 ring about y), spacing, scale
  extra: vec4f,    // attractor flow, attractor scale, water size, reflection
  rep2: vec4f,     // how far into the copies (0: one form, 1: all copies), spin, 0, 0
  sheetv: vec4f,   // layout (0 a square of side terrain.w, 1 a fan with no edge), reach, fan origin z, 0
  shape2: vec4f,   // supershape m1, m2, gyroid cell, phyllotaxis seeds
  hole: vec4f,     // black hole at the world origin: horizon radius (0: none), disk inner, disk outer, spin
}

struct Globals {
  res: vec4f,    // width, height, frame, particles
  shares: vec4f, // cumulative shares of populations 0, 1, 2; grid side
  more: vec4f,   // logo points, where SHADER ends and ERA begins, 0, 0
}

@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var<storage, read> st: array<State, 8>;
@group(0) @binding(2) var<storage, read> logo: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> points: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> depth: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> light: array<atomic<u32>>;
// Per blob: count, Σx, Σy, Σx²/64, Σy²/64, Σz, Σ(4·dx + 4096), Σ(4·dy + 4096): pixels, world units for
// z, and dx, dy the screen motion over the shutter.
@group(0) @binding(7) var<storage, read_write> blobs: array<atomic<u32>>;
// A strange attractor's trajectory (Lorenz, integrated in open), centred: xyz, speed.
@group(0) @binding(8) var<storage, read> attractor: array<vec4f>;

const BLOB_STRIDE = 8u;
const BLOBS_PER_POP = 512u;
var<private> shardId: i32 = -1;

const PI = 3.14159265;
const TAU = 6.2831853;
const FIXED = 65536.0;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(v: u32) -> f32 { return f32(pcg(v)) / 4294967296.0; }
fn h2(p: vec2i, seed: u32) -> f32 { return rnd(pcg(bitcast<u32>(p.x) ^ seed) ^ (bitcast<u32>(p.y) * 1664525u)); }
fn h3(p: vec3i, seed: u32) -> f32 { return rnd(pcg(pcg(bitcast<u32>(p.x) ^ seed) ^ (bitcast<u32>(p.y) * 1664525u)) ^ (bitcast<u32>(p.z) * 22695477u)); }

fn noise2(x: vec2f, seed: u32) -> f32 {
  let i = vec2i(floor(x));
  let f = fract(x);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(h2(i, seed), h2(i + vec2i(1, 0), seed), u.x), mix(h2(i + vec2i(0, 1), seed), h2(i + vec2i(1, 1), seed), u.x), u.y);
}
fn noise3(x: vec3f, seed: u32) -> f32 {
  let i = vec3i(floor(x));
  let f = fract(x);
  let u = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(h3(i, seed), h3(i + vec3i(1, 0, 0), seed), u.x), mix(h3(i + vec3i(0, 1, 0), seed), h3(i + vec3i(1, 1, 0), seed), u.x), u.y);
  let b = mix(mix(h3(i + vec3i(0, 0, 1), seed), h3(i + vec3i(1, 0, 1), seed), u.x), mix(h3(i + vec3i(0, 1, 1), seed), h3(i + vec3i(1, 1, 1), seed), u.x), u.y);
  return mix(a, b, u.z);
}
fn vnoise3(x: vec3f, seed: u32) -> vec3f {
  return vec3f(noise3(x, seed), noise3(x + 17.3, seed + 1u), noise3(x - 9.1, seed + 2u)) * 2.0 - 1.0;
}

// The land: ridged octaves. `octaves` counts how many have arrived (fractional while one grows in);
// `zoom` slides the octave window, so falling into the land never runs out of detail.
fn terrainH(xz: vec2f, s: State) -> f32 {
  let z = s.zoom.x;
  let oct = s.terrain.x;
  var p = xz / 9.0;
  if (s.terrain.z > 0.0) {
    p += s.terrain.z * (vec2f(noise2(p * 0.7 + 3.1, 91u), noise2(p * 0.7 + 7.7, 92u)) - 0.5) * 2.0;
  }
  var sum = 0.0;
  let k0 = max(0, i32(floor(z - 1.0)));
  let k1 = i32(ceil(z + oct));
  for (var k = k0; k <= k1; k++) {
    let j = f32(k) - z;
    var w = clamp(oct - j, 0.0, 1.0);
    if (z > 0.0) { w *= clamp(j + 1.0, 0.0, 1.0); }
    if (w <= 0.0) { continue; }
    let f = exp2(j);
    let n = noise2(p * f + vec2f(f32(k) * 7.31, f32(k) * 3.17), u32(k) + 11u);
    let r = 1.0 - abs(2.0 * n - 1.0);
    sum += w * mix(n, r * r, s.bend.w) / f;
  }
  return sum * s.terrain.y;
}

fn lineForm(q: vec2f, s: State) -> vec4f {
  let x = (q.x - 0.5) * s.terrain.w;
  let reveal = s.line.x;
  let a = s.audio;
  let u = q.x * 2.0 - 1.0;
  let window = 1.0 - u * u;
  var y = 0.0;
  y += a.x * sin(u * s.line.z * 1.0 + s.line.w) * 1.0;
  y += a.y * sin(u * s.line.z * 2.7 - s.line.w * 1.7) * 0.6;
  y += a.z * sin(u * s.line.z * 7.3 + s.line.w * 2.9) * 0.3;
  y += a.w * sin(u * s.line.z * 19.0 - s.line.w * 4.3) * 0.15;
  y *= s.line.y * window;
  // Light before it is a line: the less of it is drawn, the hotter it burns.
  return vec4f(x * reveal, y * reveal + (q.y - 0.5) * 0.06, 0.0, 1.0 + 40.0 * (1.0 - reveal) * (1.0 - reveal));
}

// Where a sheet's point q lies on the ground. A square of side terrain.w; or, with layout 1, a fan with
// no edge seen from anywhere near +z: rows packed near the fan's origin and spreading exponentially out
// to `reach`, each row wider the further it is.
fn sheetXZ(q: vec2f, s: State) -> vec2f {
  let square = (q - 0.5) * s.terrain.w;
  if (s.sheetv.x <= 0.0) { return square; }
  let d = 1.0 + s.sheetv.y * (exp(4.0 * q.y) - 1.0) / (exp(4.0) - 1.0);
  let fan = vec2f((q.x - 0.5) * (d * 2.3 + 10.0), s.sheetv.z - d);
  return mix(square, fan, s.sheetv.x);
}

fn terrainForm(q: vec2f, s: State) -> vec4f {
  let xz = sheetXZ(q, s);
  return vec4f(xz.x, terrainH(xz, s), xz.y, 0.0);
}

// The land quantised into blocks: each cell's height is the land's at its centre, cut into floors.
fn cityForm(q: vec2f, s: State) -> vec4f {
  let xz = sheetXZ(q, s);
  let c = s.city.x;
  let cell = floor(xz / c);
  let l = xz / c - cell;
  let id = vec2i(cell);
  let centre = (cell + 0.5) * c;
  let land = terrainH(centre, s);
  let levels = s.city.z;
  let jitter = 0.55 + 0.9 * h2(id, 5u);
  let hb = max(floor(land * s.city.y * jitter * levels / max(s.terrain.y, 0.01)) / levels, 0.0) * s.terrain.y;
  let gap = 0.13;
  if (min(l.x, l.y) < gap || max(l.x, l.y) > 1.0 - gap) {
    return vec4f(xz.x, 0.0, xz.y, 0.0);
  }
  var m = (l - gap) / (1.0 - 2.0 * gap);
  let e = min(min(m.x, m.y), min(1.0 - m.x, 1.0 - m.y));
  let band = 0.36;
  var y = hb;
  var em = 0.0;
  if (e < band && hb > 0.0) {
    if (e == m.x) { m.x = 0.0; } else if (e == m.y) { m.y = 0.0; } else if (e == 1.0 - m.x) { m.x = 1.0; } else { m.y = 1.0; }
    y = hb * (e / band);
    let floorH = c * 0.16;
    let fl = floor(y / floorH);
    let lit = h2(vec2i(id.x * 131 + i32(fl), id.y * 71 + i32(floor((m.x + m.y) * 7.0))), 9u);
    em = s.city.w * step(0.62, lit) * step(0.35, fract(y / floorH));
  }
  let p = (cell + gap + m * (1.0 - 2.0 * gap)) * c;
  return vec4f(p.x, y, p.y, em);
}

fn sphereForm(q: vec2f, s: State) -> vec4f {
  let th = q.x * TAU + s.sphere.z;
  let ph = acos(1.0 - 2.0 * q.y);
  let d = vec3f(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
  var n = 0.0;
  var f = 1.6;
  var a = 1.0;
  for (var k = 0u; k < 5u; k++) {
    let v = noise3(d * f, 40u + k);
    n += a * (1.0 - abs(2.0 * v - 1.0));
    f *= 2.1;
    a *= 0.5;
  }
  let r = s.sphere.x * (1.0 + s.sphere.y * (floor(n * 4.0) / 4.0 - 0.6));
  return vec4f(d * r, 0.0);
}

// The wordmark. While ERA is away, SHADER stands alone in the middle and ERA's points are out in the
// dark, deep behind it; as ERA comes in out of the depth the whole word slides to centre.
fn glyphForm(q: vec2f, h: u32, s: State) -> vec4f {
  let n = u32(g.more.x);
  let p = logo[pcg(h ^ 0x9e3779b9u) % n];
  let w = s.glyph.y;
  let away = s.glyph.w;
  let era = p.x > g.more.y;
  let z = (rnd(h ^ 0x51ed270bu) - 0.5) * s.glyph.x;
  var o = vec3f(s.glyph.z + (p.x - 0.5 * (g.more.y - 0.5) * away) * w, p.y * w, z);
  if (era && away > 0.0) {
    // Out there they are a fine dust spread over the whole frame, like far stars.
    let r = vec2f(rnd(h ^ 0x2545f491u), rnd(h ^ 0x68e31da4u)) - 0.5;
    let deep = 900.0 * (0.4 + rnd(h ^ 0x1b873593u));
    o += vec3f(r.x * 0.5 * deep, r.y * 0.3 * deep, -deep) * away * away;
  }
  return vec4f(o, 0.4);
}

// A (p, q) torus knot, as a tube; q.x runs along it, q.y round the tube.
fn knotCentre(u: f32, s: State) -> vec3f {
  let r = cos(s.knot.y * u) + 2.0;
  return vec3f(r * cos(s.knot.x * u), r * sin(s.knot.x * u), -sin(s.knot.y * u)) * s.knot.z;
}
fn knotForm(q: vec2f, s: State) -> vec4f {
  let u = q.x * TAU + s.misc.x * 0.3;
  let c = knotCentre(u, s);
  let t = normalize(knotCentre(u + 0.002, s) - c);
  let b = normalize(cross(t, c + vec3f(0.0, 0.0, 0.01)));
  let n = cross(b, t);
  let v = q.y * TAU;
  return vec4f(c + s.knot.w * (cos(v) * n + sin(v) * b), 0.0);
}

// The Lorenz attractor's trajectory, flowing: q.x is where along it, q.y a little way off it.
fn attractorForm(q: vec2f, h: u32, s: State) -> vec4f {
  let n = arrayLength(&attractor);
  let i = u32(fract(q.x + s.misc.x * s.extra.x) * f32(n)) % n;
  let a = attractor[i];
  let off = vnoise3(vec3f(q * 400.0, 0.0), 71u) * 0.18 * q.y;
  return vec4f(a.xyz * s.extra.y + off, 0.15 * a.w);
}

// Four strands wound round the y axis.
fn helixForm(q: vec2f, s: State) -> vec4f {
  let strand = floor(q.y * 4.0);
  let a = q.x * TAU * 3.0 + strand * PI * 0.5 + s.misc.x * 1.5;
  let r = s.vox.z;
  let tube = fract(q.y * 4.0) * TAU;
  let c = vec3f(r * cos(a), (q.x - 0.5) * 36.0, r * sin(a));
  let out = vec3f(cos(a), 0.0, sin(a));
  return vec4f(c + 0.35 * (cos(tube) * out + sin(tube) * vec3f(0.0, 1.0, 0.0)), 0.0);
}

// Rings facing the camera, each pushed in and out by one band of the song.
fn ringsForm(q: vec2f, s: State) -> vec4f {
  let k = floor(q.y * 24.0);
  let r = 2.0 + k * 0.75;
  let a = q.x * TAU;
  let band = select(select(select(s.audio.w, s.audio.z, k < 18.0), s.audio.y, k < 12.0), s.audio.x, k < 6.0);
  let d = s.vox.w * band * sin(a * (3.0 + k) + s.misc.x * (2.0 + k * 0.3));
  return vec4f((r + d * 0.3) * cos(a), (r + d * 0.3) * sin(a), d, 0.2 * band);
}

// Open water whose waves are the song: long swells from the sub, chop from the mids, glitter from
// the highs, all running toward the camera so their crests lie across the frame like a waveform.
fn waterForm(q: vec2f, s: State) -> vec4f {
  // The water has no edge: its points are laid out in the camera's view, rows packed near the lens and
  // spreading out exponentially to the horizon, each row as wide as the view there. The waves are a
  // field in world space, so the water does not move with the camera; only where it is sampled does.
  let xz = sheetXZ(q, s);
  let t = s.misc.x;
  let a = s.audio;
  var y = 0.0;
  y += (0.25 + 1.2 * a.x) * sin(xz.y * 0.32 - t * 2.1);
  y += (0.15 + 0.7 * a.y) * sin(xz.y * 0.85 + xz.x * 0.18 - t * 3.3);
  y += (0.06 + 0.35 * a.z) * sin(xz.x * 0.62 + xz.y * 1.7 - t * 4.4);
  y += (0.02 + 0.16 * a.w) * sin(xz.y * 3.1 - xz.x * 1.3 - t * 6.7);
  y += 0.12 * (noise2(xz * 0.9 + vec2f(0.0, -t * 1.3), 81u) - 0.5);
  // Crests glow: each wave's ridge is a line of light across the frame, a waveform drawn on water.
  let crest = clamp(y * 0.9, 0.0, 1.0);
  return vec4f(xz.x, y * s.line.y * 0.35, xz.y, 0.06 + 0.9 * crest * crest);
}

// A gyroid, the triply periodic minimal surface: each point starts somewhere in a cube and is pushed
// onto the surface by Newton steps. The surface breathes with time.
fn gyroidF(p: vec3f, ph: f32) -> f32 {
  return sin(p.x) * cos(p.y + ph) + sin(p.y) * cos(p.z) + sin(p.z + ph * 0.5) * cos(p.x);
}
fn gyroidG(p: vec3f, ph: f32) -> vec3f {
  return vec3f(
    cos(p.x) * cos(p.y + ph) - sin(p.z + ph * 0.5) * sin(p.x),
    -sin(p.x) * sin(p.y + ph) + cos(p.y) * cos(p.z),
    -sin(p.y) * sin(p.z) + cos(p.z + ph * 0.5) * cos(p.x));
}
fn gyroidForm(q: vec2f, h: u32, s: State) -> vec4f {
  let cell = s.shape2.z;
  let k = 6.2831853 / cell;
  var p = (vec3f(q, rnd(h ^ 0x6a09e667u)) - 0.5) * 22.0 * k;
  let ph = s.misc.x * 0.8;
  for (var i = 0; i < 5; i++) {
    let g = gyroidG(p, ph);
    p -= gyroidF(p, ph) * g / max(dot(g, g), 1e-3);
  }
  // Inside a sphere, so it reads as an object.
  let o = p / k;
  let r = length(o);
  return vec4f(o * min(1.0, 11.0 / max(r, 1e-3)), 0.08 * step(10.5, r));
}

// Phyllotaxis: seeds on a dome, each at the golden angle from the last, each seed a small cluster.
fn phylloForm(q: vec2f, h: u32, s: State) -> vec4f {
  let n = s.shape2.w;
  let k = floor(q.x * n);
  let r = sqrt(k / n) * 13.0;
  let a = k * 2.39996323 + s.misc.x * 0.4;
  let dome = 6.0 * (1.0 - (r / 13.0) * (r / 13.0));
  let pulse = 1.2 * s.audio.x * sin(r * 0.9 - s.misc.x * 6.0);
  let c = vec3f(r * cos(a), dome + pulse, r * sin(a));
  let j = vnoise3(vec3f(q * 900.0, k), 91u) * (0.09 + 0.05 * sqrt(k / n));
  return vec4f(c + j, 0.25 * step(0.92, fract(k * 0.618)));
}

// The 3D superformula; its symmetries step with the song.
fn superR(a: f32, m: f32, n1: f32, n2: f32, n3: f32) -> f32 {
  let t1 = pow(abs(cos(m * a / 4.0)), n2);
  let t2 = pow(abs(sin(m * a / 4.0)), n3);
  return pow(max(t1 + t2, 1e-4), -1.0 / n1);
}
fn superForm(q: vec2f, s: State) -> vec4f {
  let th = (q.x - 0.5) * TAU;
  let ph = (q.y - 0.5) * PI;
  let r1 = superR(th, s.shape2.x, 0.9, 0.5, 0.5);
  let r2 = superR(ph, s.shape2.y, 0.9, 0.5, 0.5);
  let p = vec3f(r1 * cos(th) * r2 * cos(ph), r2 * sin(ph), r1 * sin(th) * r2 * cos(ph));
  return vec4f(p * 7.5, 0.0);
}

// Strands: hair-like lines from seeds on a ring, each bent by a slow noise field.
fn flowForm(q: vec2f, h: u32, s: State) -> vec4f {
  let seed = floor(q.y * 900.0);
  let a = seed * 2.39996323;
  let base = vec3f(cos(a) * 3.0, -10.0 + 2.0 * rnd(u32(seed) * 31u), sin(a) * 3.0);
  let u = q.x;
  var p = base + vec3f(0.0, u * 22.0, 0.0);
  p += vnoise3(vec3f(seed * 0.37, u * 2.2 - s.misc.x * 0.6, 0.0), 93u) * (2.0 + 9.0 * u);
  p += vec3f(cos(a), 0.0, sin(a)) * u * u * 8.0;
  return vec4f(p, 0.12 * u);
}

// A black hole's accretion disk, turning faster inside (Kepler: ω ∝ r^-1.5), hotter inside; and, from
// q.y above 0.72, the photon ring: the disk's far side bent up over the hole, a ring standing in the
// xy plane.
fn diskForm(q: vec2f, h: u32, s: State) -> vec4f {
  let rin = s.hole.y;
  let rout = s.hole.z;
  if (q.y < 0.72) {
    // Log-uniform in radius: dense and bright at the inner edge, thinning out to a dust that reaches
    // past the frame.
    let r = rin * pow(rout / rin, q.y / 0.72);
    let a = q.x * TAU + s.hole.w * pow(rin / r, 1.5);
    let y = (rnd(h ^ 0x9b05688cu) - 0.5) * 0.08 * r;
    return vec4f(r * cos(a), y, r * sin(a), 0.5 + 1.4 * (rin / r) * (rin / r));
  }
  let u = (q.y - 0.72) / 0.28;
  let r = s.hole.x * (1.25 + 0.5 * u * u);
  let a = q.x * TAU + s.hole.w * 0.7;
  return vec4f(r * cos(a), r * sin(a), (rnd(h ^ 0x1f83d9abu) - 0.5) * 0.2, 1.2 * (1.0 - u));
}

// Rocks round the hole: forty faceted lumps, each tumbling on its own orbit. With hole.x < 0 they are
// meteors instead: twenty-four, bigger, scattered round the loop's axis and flying down it at hole.z units
// a second, at the camera and past it.
fn rocksForm(q: vec2f, h: u32, s: State) -> vec4f {
  let meteor = s.hole.x < 0.0;
  let count = select(40.0, 24.0, meteor);
  let k = floor(q.y * count);
  let id = u32(k);
  let v = fract(q.y * count);
  let th = q.x * TAU;
  let ph = acos(1.0 - 2.0 * v);
  var d = vec3f(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
  // Faceted: the radius steps with a coarse noise, and the lump is squashed toward a cube.
  let facet = floor(noise3(d * 2.3 + k, 95u) * 4.0) / 4.0;
  d = d / pow(pow(abs(d.x), 4.0) + pow(abs(d.y), 4.0) + pow(abs(d.z), 4.0), 0.25);
  let size = (0.35 + 0.9 * rnd(id * 3u)) * select(1.0, 2.2, meteor);
  let local = d * size * (0.75 + 0.5 * facet);
  let axis = normalize(vnoise3(vec3f(k, 1.0, 2.0), 96u) + vec3f(0.0, 0.001, 0.0));
  let spun = rotate(local, axis, s.misc.x * (1.0 + 3.0 * rnd(id * 5u)));
  if (meteor) {
    let r = 1.6 + 3.8 * sqrt(rnd(id * 7u));
    let a = rnd(id * 11u) * TAU;
    let z = 24.0 - 80.0 * fract(rnd(id * 17u) - s.misc.x * s.hole.z / 80.0);
    // They glow, hotter the closer they come.
    return vec4f(vec3f(r * cos(a), r * sin(a), z) + spun, 0.08 + 0.4 * smoothstep(-56.0, 10.0, z));
  }
  let orbit = s.hole.y + (min(s.hole.z, 16.0) - s.hole.y) * 1.3 * rnd(id * 7u) + 2.0;
  let a = rnd(id * 11u) * TAU + s.hole.w * pow(s.hole.y / orbit, 1.5) * 0.8;
  let tilt = (rnd(id * 13u) - 0.5) * 0.5;
  let c = vec3f(orbit * cos(a), orbit * sin(a) * tilt, orbit * sin(a));
  return vec4f(c + spun, 0.0);
}

// The sheet forms (line, land, city) ripple and bend; sphere and glyph are objects and do not.
fn sheet(a0: vec4f, s: State) -> vec4f {
  var a = a0;
  if (s.misc.y > 0.0) {
    let r = length(a.xz);
    a.y += s.misc.y * sin(r * 0.9 - s.misc.z) * exp(-abs(r * 0.9 - s.misc.z) * 0.35);
  }
  return vec4f(bend(a.xyz, s), a.w);
}

fn formAt(kind: f32, q: vec2f, h: u32, s: State) -> vec4f {
  let k = i32(kind + 0.5);
  if (k == 0) { return sheet(lineForm(q, s), s); }
  if (k == 1) { return sheet(terrainForm(q, s), s); }
  if (k == 2) { return sheet(cityForm(q, s), s); }
  if (k == 3) { return sphereForm(q, s); }
  if (k == 4) { return glyphForm(q, h, s); }
  if (k == 5) { return knotForm(q, s); }
  if (k == 6) { return attractorForm(q, h, s); }
  if (k == 7) { return helixForm(q, s); }
  if (k == 8) { return ringsForm(q, s); }
  if (k == 9) { return sheet(waterForm(q, s), s); }
  if (k == 10) { return gyroidForm(q, h, s); }
  if (k == 11) { return phylloForm(q, h, s); }
  if (k == 12) { return superForm(q, s); }
  if (k == 13) { return flowForm(q, h, s); }
  if (k == 14) { return diskForm(q, h, s); }
  if (k == 15) { return rocksForm(q, h, s); }
  return vec4f(0.0);
}

// When this particle crosses: 0 when the morph starts, 1 when it ends.
fn crossing(q: vec2f, s: State) -> f32 {
  let mode = i32(s.form.w + 0.5);
  var w = 0.0;
  if (mode == 0) { w = noise2(q * 5.0, 77u) * 0.7 + noise2(q * 23.0, 78u) * 0.3; }
  else if (mode == 1) { w = abs(q.y - 0.5) * 2.0; }
  else if (mode == 2) { w = length(q - 0.5) * 1.41; }
  else if (mode == 3) { w = q.y; }
  else { w = 1.0 - q.y; }
  let width = s.morph.x;
  let e = clamp((s.form.z * (1.0 + width) - w * width), 0.0, 1.0);
  return e * e * (3.0 - 2.0 * e);
}

fn bend(p: vec3f, s: State) -> vec3f {
  var o = p;
  // Fold: past z0 the sheet curls up and over, around a hinge of radius 1/k.
  let kf = s.bend.y;
  if (kf > 1e-5 && o.z < s.bend.x) {
    let d = s.bend.x - o.z;
    let a = d * kf;
    let y = o.y;
    o.z = s.bend.x - sin(a) / kf + y * sin(a);
    o.y = (1.0 - cos(a)) / kf + y * cos(a);
  }
  // Wrap: the whole sheet rolls up across x into a tunnel around the z axis.
  let kw = s.bend.z;
  if (kw > 1e-5) {
    let a = o.x * kw;
    let y = o.y;
    o.x = sin(a) / kw - y * sin(a);
    o.y = (1.0 - cos(a)) / kw + y * cos(a);
  }
  return o;
}

fn rotate(v: vec3f, axis: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  return v * c + cross(axis, v) * sin(a) + axis * dot(axis, v) * (1.0 - c);
}

// DXIL has no calls, so each call site of a heavy function is one more inlined copy of it, and
// compile time grows with them. Each heavy function (formAt, shape, place) is called from one site,
// in a loop whose count comes from the state, so the compiler cannot unroll it into copies again.

fn shape(q: vec2f, h: u32, s: State) -> vec4f {
  let m = s.form.z;
  // The form, and while it morphs, the form it becomes.
  var f: array<vec4f, 2>;
  for (var k = 0; k < select(1, 2, m > 0.0); k++) { f[k] = formAt(select(s.form.x, s.form.y, k == 1), q, h, s); }
  var a = f[0];
  if (m > 0.0) {
    let b = f[1];
    let e = crossing(q, s);
    a = mix(a, b, e);
    let t = s.morph.y * sin(PI * e);
    if (t > 0.0) { a = vec4f(a.xyz + t * vnoise3(a.xyz * 0.12 + s.morph.z, 3u), a.w); }
  }
  return a;
}

// One particle's place: the shape, broken into shards, pulled to a point, placed in the world.
fn place(q: vec2f, h: u32, s: State) -> vec4f {
  let T0 = s.shard.x;
  let n = s.shard.y;
  var fid = vec2i(0);
  var fq = vec2f(0.0);
  var sid = 0u;
  var T = 0.0;
  if (T0 > 0.0) {
    let c = q * n;
    let ci = vec2i(floor(c));
    var best = 9.0;
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let id = ci + vec2i(x, y);
        let f = vec2f(id) + vec2f(h2(id, 61u), h2(id, 62u));
        let d = dot(f - c, f - c);
        if (d < best) { best = d; fid = id; fq = f; }
      }
    }
    sid = pcg((bitcast<u32>(fid.x) * 7919u) ^ (bitcast<u32>(fid.y) * 104729u));
    let cells = i32(n);
    shardId = (((fid.y % cells) + cells) % cells) * cells + (((fid.x % cells) + cells) % cells);
    let delay = floor(rnd(sid) * 8.0) * s.vox.y;
    T = max(0.0, T0 - delay);
  }
  // The particle's shape, and while its shard flies, the shape at the shard's centre.
  var at: array<vec4f, 2>;
  for (var k = 0; k < select(1, 2, T > 0.0); k++) { at[k] = shape(select(q, fq / n, k == 1), h, s); }
  var p = at[0];
  if (T > 0.0) {
    let centre = at[1].xyz;
    let away = normalize(centre + vnoise3(vec3f(f32(fid.x), f32(fid.y), 0.0) * 0.37, 63u) * 0.8 + vec3f(0.0, 0.001, 0.0));
    let speed = s.shard.z * (0.4 + rnd(sid ^ 5u));
    let axis = normalize(vnoise3(vec3f(f32(fid.x), f32(fid.y), 1.0) * 0.73, 64u) + vec3f(0.0, 0.0, 0.001));
    let ang = T * s.shard.w * (rnd(sid ^ 9u) - 0.5) * 2.0;
    let crack = 1.0 - 0.12 * min(T * 6.0, 1.0);
    p = vec4f(centre + away * speed * T + rotate(p.xyz - centre, axis, ang) * crack, p.w + 0.3 * exp(-T * 3.0));
  }
  let c = s.morph.w;
  if (c > 0.0) {
    let e = clamp(c * 1.6 - rnd(h ^ 0x2545f491u) * 0.6, 0.0, 1.0);
    let k = e * e * (3.0 - 2.0 * e);
    p = vec4f(mix(p.xyz, vec3f(0.0), k), p.w + 40.0 * pow(k, 12.0));
  }
  // Instancing: the particle belongs to one of `copies` copies of the form.
  let copies = u32(max(s.rep.x, 1.0));
  let mode = i32(s.rep.y + 0.5);
  if (copies > 1u && mode > 0 && s.rep2.x > 0.0) {
    let c = pcg(h ^ 0x7feb352du) % copies;
    let f = f32(c);
    let base = p.xyz;
    var o = p.xyz * s.rep.w;
    if (mode == 1) {
      let a = TAU * f / f32(copies) + s.rep2.y;
      let r = vec3f(o.x + s.rep.z, o.y, o.z);
      o = vec3f(r.x * cos(a) - r.y * sin(a), r.x * sin(a) + r.y * cos(a), r.z);
    } else if (mode == 2) {
      let side = u32(ceil(sqrt(f32(copies))));
      let cell = vec2f(f32(c % side), f32(c / side)) - (f32(side) - 1.0) * 0.5;
      o += vec3f(cell.x * s.rep.z, cell.y * s.rep.z, 0.0);
    } else {
      let a = TAU * f / f32(copies) + s.rep2.y;
      let r = vec3f(o.x, o.y, o.z - s.rep.z);
      o = vec3f(r.x * cos(a) + r.z * sin(a), r.y, -r.x * sin(a) + r.z * cos(a));
    }
    let k = s.rep2.x * s.rep2.x * (3.0 - 2.0 * s.rep2.x);
    p = vec4f(mix(base, o, k), p.w);
  }
  return vec4f(p.xyz * s.world.w + s.world.xyz, p.w);
}

// Voxels: the matter snapped into cubes of `cell`, each a little cloud.
fn voxel(p: vec3f, h: u32, s: State) -> vec3f {
  let c = s.vox.x;
  if (c <= 0.0) { return p; }
  let j = vec3f(rnd(h ^ 0x1u), rnd(h ^ 0x2u), rnd(h ^ 0x3u)) - 0.5;
  return (floor(p / c) + 0.5) * c + j * c * 0.72;
}

struct Screen { xy: vec2f, z: f32, ok: bool }

fn project(s: State, p: vec3f) -> Screen {
  let c = s.vp * vec4f(p, 1.0);
  var o: Screen;
  o.ok = c.w > 0.05;
  o.xy = vec2f((c.x / c.w * 0.5 + 0.5) * g.res.x, (0.5 - c.y / c.w * 0.5) * g.res.y);
  o.z = c.w;
  return o;
}

fn steel(p: vec3f, n0: vec3f, em: f32, s: State) -> vec3f {
  let v = normalize(s.eye.xyz - p);
  var n = n0;
  if (dot(n, v) < 0.0) { n = -n; }
  let l = s.key.xyz;
  let diff = max(dot(n, l), 0.0);
  let hv = normalize(l + v);
  let rough = s.mat.x;
  let shin = 2.0 / max(rough * rough, 0.002);
  let spec = pow(max(dot(n, hv), 0.0), shin) * (shin + 2.0) / 8.0;
  let fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  let albedo = vec3f(0.50, 0.53, 0.57);
  let f0 = mix(vec3f(0.04), albedo, s.mat.y);
  var c = s.key.w * (albedo * diff * (1.0 - s.mat.y) + f0 * spec * diff);
  c += s.rim.w * fres * max(dot(n, s.rim.xyz) * 0.5 + 0.5, 0.0) * vec3f(0.75, 0.85, 1.0);
  c += vec3f(0.010, 0.013, 0.018) * (0.6 + 0.4 * n.y);
  c += em * s.lens.w * vec3f(0.85, 0.92, 1.0);
  // Reflection: a sky that is bright at the horizon, and the sun's glint.
  if (s.extra.w > 0.0) {
    let r = reflect(-v, n);
    let horizon = exp(-abs(r.y - 0.06) * 9.0);
    let sky = vec3f(0.55, 0.66, 0.85) * (0.15 + 1.6 * horizon);
    let glint = pow(max(dot(r, l), 0.0), 380.0) * 60.0;
    let schlick = 0.02 + 0.98 * fres;
    c += s.extra.w * (sky * schlick + glint * vec3f(1.0, 0.97, 0.9));
  }
  let tint = mix(vec3f(0.93, 0.98, 1.06), vec3f(1.12, 0.86, 0.62), s.mat.w);
  let dist = length(s.eye.xyz - p);
  return c * tint * exp(-s.mat.z * dist);
}

// A TouchDesigner-style ramp: black, violet, magenta, orange, white.
fn ramp(t0: f32) -> vec3f {
  let t = clamp(t0, 0.0, 1.0) * 4.0;
  let k = array(vec3f(0.0, 0.0, 0.03), vec3f(0.22, 0.03, 0.48), vec3f(0.86, 0.12, 0.38), vec3f(1.0, 0.55, 0.08), vec3f(1.0, 0.98, 0.86));
  let i = min(u32(t), 3u);
  return mix(k[i], k[i + 1u], t - f32(i));
}

fn hue(h: f32) -> vec3f {
  return clamp(abs(fract(h + vec3f(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0));
}

// Recolour the lit steel. Light (its luminance) is kept; what it is painted with comes from the data:
// how fast the particle moves, how far it is, which way it faces.
fn paint(c: vec3f, p0: vec3f, p1: vec3f, n: vec3f, z: f32, q: vec2f, s: State) -> vec3f {
  let mode = i32(s.paint.x + 0.5);
  if (mode == 0 || s.paint.y <= 0.0) { return c; }
  let lum = dot(c, vec3f(0.3, 0.59, 0.11));
  var o = c;
  if (mode == 1) { o = ramp(length(p1 - p0) * s.paint.z + s.paint.w) * (lum * 2.5 + 0.004); }
  else if (mode == 2) { let b = fract(z * s.paint.z + s.paint.w); o = ramp(0.25 + 0.75 * b * b) * (lum * 2.0 + 0.002) * (0.4 + 1.6 * step(0.92, b)); }
  else if (mode == 3) { o = mix(vec3f(1.0), hue(dot(n, vec3f(0.31, 0.53, 0.79)) * s.paint.z + s.paint.w), 0.85) * lum * 2.2; }
  else if (mode == 4) { o = vec3f(1.0, 0.24, 0.06) * lum * 2.4; }
  else if (mode == 5) {
    // Thin film: hue from how obliquely the surface is seen.
    let v = normalize(s.eye.xyz - p1);
    let f = 1.0 - abs(dot(n, v));
    o = hue(f * s.paint.z + s.paint.w) * (lum * 2.4 + 0.01) * (0.5 + f);
  } else if (mode == 6) {
    // Contour lines of height, every 1 / scale units, in accent; the rest dimmed.
    let b = fract(p1.y * s.paint.z + s.paint.w);
    o = mix(c * 0.18, vec3f(1.0, 0.24, 0.06) * (lum * 3.0 + 0.05), smoothstep(0.86, 0.95, b));
  } else if (mode == 7) {
    // Wireframe: the lines of the particle's own coordinate grid, cool and bright; the faces dark.
    let g = abs(fract(q * s.paint.z) - 0.5);
    let line = smoothstep(0.44, 0.49, max(g.x, g.y));
    o = mix(c * 0.08, vec3f(0.75, 0.9, 1.0) * (lum * 3.0 + 0.04), line);
  } else if (mode == 8) { o = (n * 0.5 + 0.5) * (lum * 2.2 + 0.01); }
  else if (mode == 9) { o = mix(vec3f(0.03, 0.06, 0.32), vec3f(1.0, 0.24, 0.06), smoothstep(0.0, 0.5, lum)) * (lum * 2.0 + 0.01); }
  else {
    // Cold heat: how fast it moves, from black through deep blue and steel to white.
    let v = clamp(length(p1 - p0) * s.paint.z + s.paint.w, 0.0, 1.0);
    let k = array(vec3f(0.0, 0.0, 0.0), vec3f(0.04, 0.09, 0.32), vec3f(0.42, 0.62, 0.95), vec3f(1.0, 1.0, 1.0));
    let x = v * 3.0;
    let i = min(u32(x), 2u);
    o = mix(k[i], k[i + 1u], x - f32(i)) * (lum * 2.6 + 0.01);
  }
  return mix(c, o, s.paint.y);
}

// Data glitch: whole blocks of the coordinate square are dealt to the wrong place, so a piece of the
// form appears where another piece belongs.
fn scramble(q: vec2f, s: State) -> vec2f {
  if (s.glitch.x <= 0.0) { return q; }
  let n = s.glitch.y;
  let b = vec2i(floor(q * n));
  let seed = u32(s.glitch.z);
  if (h2(b, seed) >= s.glitch.x) { return q; }
  let to = vec2f(floor(h2(b, seed + 1u) * n), floor(h2(b, seed + 2u) * n));
  return (to + fract(q * n)) / n;
}

// Where particle i lands on screen and with what light. Writes the nearest depth, dilated, for the
// splat to test against.
@compute @workgroup_size(256) fn evaluate(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (f32(i) >= g.res.w) { return; }
  let side = u32(g.shares.w);
  let h = pcg(i ^ 0xa511e9b3u);
  // Nearly a lattice: ordered enough to read as a dot matrix, loose enough not to alias.
  let q0 = (vec2f(f32(i % side), f32(i / side)) + 0.5 + (vec2f(rnd(h), rnd(h ^ 0x68e31da4u)) - 0.5) * 0.3) / f32(side);
  let r = rnd(h ^ 0x1b873593u);
  let pop = select(select(select(3u, 2u, r < g.shares.z), 1u, r < g.shares.y), 0u, r < g.shares.x);
  let s0 = st[pop * 2u];
  let s1 = st[pop * 2u + 1u];
  let q = scramble(q0, s1);
  let frame = u32(g.res.z);
  let shutter = rnd(h ^ pcg(frame + 0x3c6ef372u));

  // Where the particle was (p0, the shutter's start), two neighbours a little along the sheet for its
  // normal (pu, pv), and where it is (p1). p1 goes last, after shardId is reset, so shardId is p1's
  // shard. The count comes from a uniform, so the loop is not unrolled.
  let du = 0.6 / f32(side);
  let offsets = array<vec2f, 4>(vec2f(0.0), vec2f(du, 0.0), vec2f(0.0, du), vec2f(0.0));
  var ps: array<vec4f, 4>;
  for (var k = 0; k < select(4, 0, side == 0u); k++) {
    if (k == 3) { shardId = -1; }
    ps[k] = place(q + offsets[k], h, st[pop * 2u + select(1u, 0u, k == 0)]);
  }
  let p0 = ps[0];
  let pu = ps[1].xyz;
  let pv = ps[2].xyz;
  let p1 = ps[3];
  // Blobs: a copy while the form is copied, a shard while it is broken, otherwise one of 16 × 16 blocks
  // of the square. A blob is the same thing from frame to frame, so its number is its identity.
  var blob = shardId;
  let copied = u32(max(s1.rep.x, 1.0));
  if (s1.rep.y > 0.5 && s1.rep2.x > 0.5 && copied > 1u) { blob = i32(pcg(h ^ 0x7feb352du) % copied); }
  else if (blob < 0 && s1.shard.x <= 0.0) { blob = i32(floor(q0.y * 16.0)) * 16 + i32(floor(q0.x * 16.0)); }
  let group = select(0.0, f32(i32(pop * BLOBS_PER_POP) + blob + 1), blob >= 0);
  var n = cross(pv - p1.xyz, pu - p1.xyz);
  let glyphy = select(0.0, 1.0, i32(s1.form.x + 0.5) == 4) * (1.0 - s1.form.z) + select(0.0, 1.0, i32(s1.form.y + 0.5) == 4) * s1.form.z;
  n = mix(select(normalize(n), vec3f(0.0, 1.0, 0.0), dot(n, n) < 1e-14), vec3f(0.0, 0.0, 1.0), glyphy);
  n = normalize(n);

  let a = project(s0, voxel(p0.xyz, h, s0));
  var c = project(s1, voxel(p1.xyz, h, s1));
  // The horizon hides what is behind it (and inside it).
  if (s1.hole.x > 0.0) {
    let e = s1.eye.xyz;
    let dv = p1.xyz - e;
    let tt = clamp(dot(-e, dv) / max(dot(dv, dv), 1e-6), 0.0, 1.0);
    if (length(e + dv * tt) < s1.hole.x) { c.ok = false; }
  }
  var col = vec4f(0.0);
  var at = vec4f(0.0, 0.0, 0.0, 0.0);
  var motion = vec4f(0.0);
  if (a.ok && c.ok) {
    motion = vec4f(c.xy - a.xy, 0.0, 0.0);
    var xy = mix(a.xy, c.xy, shutter);
    let z = mix(a.z, c.z, shutter);
    // Depth of field: each particle lands somewhere inside its circle of confusion.
    let coc = min(s1.lens.x * abs(z - s1.eye.w) / z, 80.0);
    let r = sqrt(rnd(h ^ pcg(frame ^ 0x7f4a7c15u))) * coc;
    let th = rnd(h ^ pcg(frame ^ 0x94d049bbu)) * TAU;
    xy += vec2f(cos(th), sin(th)) * r;
    // A long shutter with light fading toward its start reads as a trail.
    let fade = exp(-(1.0 - shutter) * s1.trail.x);
    // Each particle carries the light of the patch of matter it stands for: its patch's area on
    // screen, up to one pixel. Packed matter (a point, a line) is not brighter than spread matter,
    // and sparse matter reads as separate dots.
    let world = length(cross(pu - p1.xyz, pv - p1.xyz)) / (0.36);
    let area = mix(world, 5e-5 * s1.glyph.y * s1.glyph.y / 1156.0, glyphy);
    let ppu = g.res.y * 0.5 * s1.lensExtra.x / max(c.z, 1e-3);
    let copies = select(1.0, mix(1.0, max(s1.rep.x, 1.0), s1.rep2.x), s1.rep.y > 0.5);
    let cover = clamp(area * ppu * ppu * s1.pop.y * copies, 1.2e-5, 1.0);
    let lit = steel(p1.xyz, n, p1.w, s1);
    let shade = paint(lit, p0.xyz, p1.xyz, n, z, q, s1) * s1.lens.y * fade * cover;
    col = vec4f(shade, s1.lens.z);
    // w: 1 + the blob it belongs to (1 alone: none). 0 means not on screen.
    at = vec4f(xy, z, 1.0 + group);
    let px = vec2i(floor(xy));
    let W = i32(g.res.x);
    let H = i32(g.res.y);
    if (s1.lens.z > 0.0) {
      let key = ~bitcast<u32>(z);
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          let x = px.x + dx;
          let y = px.y + dy;
          if (x >= 0 && y >= 0 && x < W && y < H) { atomicMax(&depth[y * W + x], key); }
        }
      }
    }
  }
  points[i * 3u] = at;
  points[i * 3u + 1u] = col;
  points[i * 3u + 2u] = motion;
}

fn deposit(x: i32, y: i32, c: vec3f) {
  let W = i32(g.res.x);
  if (x < 0 || y < 0 || x >= W || y >= i32(g.res.y)) { return; }
  let k = u32(y * W + x) * 3u;
  let v = vec3u(round(max(c, vec3f(0.0)) * FIXED));
  if (v.x > 0u) { atomicAdd(&light[k], v.x); }
  if (v.y > 0u) { atomicAdd(&light[k + 1u], v.y); }
  if (v.z > 0u) { atomicAdd(&light[k + 2u], v.z); }
}

@compute @workgroup_size(256) fn splat(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (f32(i) >= g.res.w) { return; }
  let at = points[i * 3u];
  if (at.w == 0.0) { return; }
  let col = points[i * 3u + 1u];
  var w = 1.0;
  if (col.w > 0.0) {
    let px = vec2i(floor(at.xy));
    let W = i32(g.res.x);
    if (px.x >= 0 && px.y >= 0 && px.x < W && px.y < i32(g.res.y)) {
      let front = bitcast<f32>(~atomicLoad(&depth[px.y * W + px.x]));
      let hidden = at.z > front * 1.015 + 0.03;
      w = mix(1.0, select(1.0, 0.0, hidden), col.w);
    }
  }
  if (w <= 0.0) { return; }
  // Every eighth visible particle measures its blob.
  if (at.w > 1.5 && w > 0.5 && (i & 7u) == 0u && at.x >= 0.0 && at.y >= 0.0 && at.x < g.res.x && at.y < g.res.y) {
    let k = u32(at.w - 2.0) * BLOB_STRIDE;
    atomicAdd(&blobs[k], 1u);
    atomicAdd(&blobs[k + 1u], u32(round(at.x)));
    atomicAdd(&blobs[k + 2u], u32(round(at.y)));
    atomicAdd(&blobs[k + 3u], u32(round(at.x * at.x / 64.0)));
    atomicAdd(&blobs[k + 4u], u32(round(at.y * at.y / 64.0)));
    atomicAdd(&blobs[k + 5u], u32(min(at.z, 4000.0)));
    let m = clamp(points[i * 3u + 2u].xy * 4.0 + 4096.0, vec2f(0.0), vec2f(8191.0));
    atomicAdd(&blobs[k + 6u], u32(m.x));
    atomicAdd(&blobs[k + 7u], u32(m.y));
  }
  let c = col.rgb * w;
  let f = at.xy - 0.5;
  let b = vec2i(floor(f));
  let t = f - floor(f);
  deposit(b.x, b.y, c * (1.0 - t.x) * (1.0 - t.y));
  deposit(b.x + 1, b.y, c * t.x * (1.0 - t.y));
  deposit(b.x, b.y + 1, c * (1.0 - t.x) * t.y);
  deposit(b.x + 1, b.y + 1, c * t.x * t.y);
}

struct V { @builtin(position) pos: vec4f }

@vertex fn fullVs(@builtin(vertex_index) i: u32) -> V {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return V(vec4f(p * 2.0 - 1.0, 0.0, 1.0));
}

@group(0) @binding(6) var<storage, read> summed: array<u32>;

@fragment fn resolveFs(i: V) -> @location(0) vec4f {
  let k = (u32(i.pos.y) * u32(g.res.x) + u32(i.pos.x)) * 3u;
  let c = vec3f(f32(summed[k]), f32(summed[k + 1u]), f32(summed[k + 2u])) / FIXED;
  return vec4f(c, 1.0);
}
