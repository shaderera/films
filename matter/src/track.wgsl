// Blob tracking, drawn over the finished frame. Blobs were measured this frame from the particles that
// were actually visible (matter.wgsl's splat): where each is, how spread, and how fast it moves on
// screen. A blob is a thing with an identity (a copy of the form, a shard, a block of the square), so
// its box follows it from frame to frame. Each tracked blob gets corner brackets, a dashed frame, a
// crosshair, its measured velocity as an arrow, and a callout with its numbers; a chain joins the
// tracked blobs of each population in order.

struct Globals {
  res: vec4f,
  shares: vec4f,
  more: vec4f,
}

struct Track {
  a: vec4f,      // share of blobs tracked, seed, least count, chain opacity
  accent: vec4f, // tag colour, opacity of everything
  box: vec4f,    // half size in σ, least half, most half, acquisition (0 just found, 1 locked)
  more: vec4f,   // velocity arrow scale, inside treatment (0 none, 1 heat, 2 contours, 3 inverse), exposure, a callout on every nth blob
}

@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var<uniform> tr: Track;
@group(0) @binding(2) var<storage, read> blobs: array<u32>;
@group(0) @binding(3) var atlas: texture_2d<f32>;
@group(0) @binding(4) var hdr: texture_2d<f32>;

const BLOBS = 2048u;
const PER_POP = 512u;
const STRIDE = 8u;
const CW = 10.0;
const CH = 18.0;
const TAG = 11u;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(v: u32) -> f32 { return f32(pcg(v)) / 4294967296.0; }

struct Blob { ok: bool, c: vec2f, half: vec2f, n: f32, z: f32, v: vec2f }

fn blobAt(k: u32) -> Blob {
  var b: Blob;
  let n = f32(blobs[k * STRIDE]);
  b.n = n;
  b.ok = n >= max(tr.a.z, 1.0) && rnd(pcg(k * 7919u) ^ u32(tr.a.y)) < tr.a.x;
  if (!b.ok) { return b; }
  b.c = vec2f(f32(blobs[k * STRIDE + 1u]), f32(blobs[k * STRIDE + 2u])) / n;
  let m2 = vec2f(f32(blobs[k * STRIDE + 3u]), f32(blobs[k * STRIDE + 4u])) * 64.0 / n;
  let sd = sqrt(max(m2 - b.c * b.c, vec2f(0.0)));
  b.half = clamp(sd * tr.box.x, vec2f(tr.box.y), vec2f(tr.box.z));
  b.z = f32(blobs[k * STRIDE + 5u]) / n;
  b.v = (vec2f(f32(blobs[k * STRIDE + 6u]), f32(blobs[k * STRIDE + 7u])) / n - 4096.0) / 4.0;
  // Off screen, or swallowing the screen: not a thing to track.
  b.ok = b.ok && b.half.x < g.res.x * 0.3 && b.c.x > -50.0 && b.c.x < g.res.x + 50.0;
  return b;
}

struct V { @builtin(position) pos: vec4f, @location(0) @interpolate(flat) k: u32 }

fn corner(i: u32) -> vec2f {
  let c = array(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
  return c[i];
}

fn toClip(px: vec2f) -> vec4f {
  return vec4f(px.x / g.res.x * 2.0 - 1.0, 1.0 - px.y / g.res.y * 2.0, 0.0, 1.0);
}

fn arrowTip(b: Blob) -> vec2f {
  let v = b.v * tr.more.x;
  let l = length(v);
  return b.c + select(vec2f(0.0), v / l * min(l, 140.0), l > 1e-3);
}

@vertex fn boxVs(@builtin(vertex_index) i: u32, @builtin(instance_index) k: u32) -> V {
  var o: V;
  o.k = k;
  let b = blobAt(k);
  if (!b.ok) { o.pos = vec4f(2.0, 2.0, 0.0, 1.0); return o; }
  let grow = 1.0 + 0.8 * (1.0 - tr.box.w);
  let tip = arrowTip(b);
  let lo = min(b.c - b.half * grow - 8.0, tip - 8.0) - vec2f(0.0, 70.0);
  let hi = max(b.c + b.half * grow + 8.0, tip + 8.0) + vec2f(f32(TAG) * CW + 60.0, 0.0);
  o.pos = toClip(mix(lo, hi, corner(i)));
  return o;
}

fn hexDigit(d: u32) -> u32 { return select(55u + d, 48u + d, d < 10u); }
fn decDigit(v: f32, place: f32) -> u32 { return 48u + u32(floor(max(v, 0.0) / place)) % 10u; }

// Three lines: "ID 3F", "X1243 Y0587", "V 0142 PX/S".
fn tagChar(line: u32, i: u32, k: u32, b: Blob) -> u32 {
  if (line == 0u) {
    let s = array(73u, 68u, 32u, hexDigit((k >> 4u) & 15u), hexDigit(k & 15u), 32u, 32u, 32u, 32u, 32u, 32u);
    return s[min(i, 10u)];
  }
  if (line == 1u) {
    let x = clamp(b.c.x, 0.0, 9999.0);
    let y = clamp(b.c.y, 0.0, 9999.0);
    let s = array(88u, decDigit(x, 1000.0), decDigit(x, 100.0), decDigit(x, 10.0), decDigit(x, 1.0), 32u,
                  89u, decDigit(y, 1000.0), decDigit(y, 100.0), decDigit(y, 10.0), decDigit(y, 1.0));
    return s[min(i, 10u)];
  }
  let v = min(length(b.v) * 120.0, 9999.0);
  let s = array(86u, 32u, decDigit(v, 1000.0), decDigit(v, 100.0), decDigit(v, 10.0), decDigit(v, 1.0), 32u, 80u, 88u, 47u, 83u);
  return s[min(i, 10u)];
}

fn glyph(ch: u32, at: vec2f) -> f32 {
  let cell = vec2u(ch % 16u, (ch - 32u) / 16u);
  let p = vec2u(clamp(at, vec2f(0.0), vec2f(CW - 1.0, CH - 1.0)));
  return textureLoad(atlas, vec2u(cell.x * u32(CW), cell.y * u32(CH)) + p, 0).r;
}

fn segment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let d = b - a;
  let t = clamp(dot(p - a, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
  return length(p - a - d * t);
}
fn stroke(dist: f32, width: f32) -> f32 { return clamp(width - dist + 0.5, 0.0, 1.0); }

fn tone(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}
fn srgb(x: vec3f) -> vec3f {
  return select(1.055 * pow(x, vec3f(1.0 / 2.4)) - 0.055, x * 12.92, x <= vec3f(0.0031308));
}
fn heat(t0: f32) -> vec3f {
  let t = clamp(t0, 0.0, 1.0) * 4.0;
  let k = array(vec3f(0.0, 0.0, 0.03), vec3f(0.22, 0.03, 0.48), vec3f(0.86, 0.12, 0.38), vec3f(1.0, 0.55, 0.08), vec3f(1.0, 0.98, 0.86));
  let i = min(u32(t), 3u);
  return mix(k[i], k[i + 1u], t - f32(i));
}

@fragment fn boxFs(v: V) -> @location(0) vec4f {
  let b = blobAt(v.k);
  let p = v.pos.xy;
  let acquire = tr.box.w;
  let half = b.half * (1.0 + 0.8 * (1.0 - acquire));
  let d = abs(p - b.c) - half;
  let edge = max(d.x, d.y);
  var col = vec4f(0.0);

  // Inside: the same frame in another treatment, faintly.
  let mode = i32(tr.more.y + 0.5);
  if (edge <= 0.0 && mode > 0) {
    let c = tone(textureLoad(hdr, vec2u(p), 0).rgb * tr.more.z);
    let lum = dot(c, vec3f(0.3, 0.59, 0.11));
    var o = c;
    if (mode == 1) { o = heat(pow(lum, 0.6) * 1.15); }
    else if (mode == 2) { o = vec3f(1.0, 0.24, 0.06) * step(0.82, fract(lum * 9.0)); }
    else { o = vec3f(1.0) - c; }
    col = vec4f(srgb(o), 1.0) * 0.55;
  }

  // Dashed hairline frame.
  let dash = step(0.5, fract((p.x + p.y) / 9.0));
  col = mix(col, vec4f(1.0), stroke(abs(edge + 0.5), 0.5) * dash * 0.45);
  // Corner brackets, 14 px, 2 px thick.
  let nearCorner = all(abs(p - b.c) > half - vec2f(14.0));
  col = mix(col, vec4f(1.0), select(0.0, 1.0, nearCorner && edge > -2.0 && edge <= 0.0));
  // Crosshair with a ring.
  let q = p - b.c;
  let cross = max(select(0.0, 1.0, abs(q.x) < 0.7 && abs(q.y) < 9.0 && abs(q.y) > 3.0), select(0.0, 1.0, abs(q.y) < 0.7 && abs(q.x) < 9.0 && abs(q.x) > 3.0));
  col = mix(col, vec4f(1.0), max(cross, stroke(abs(length(q) - 5.0), 0.5)));
  // The measured velocity, as an arrow from the centroid.
  let tip = arrowTip(b);
  if (length(tip - b.c) > 6.0) {
    let dir = normalize(tip - b.c);
    let side = vec2f(-dir.y, dir.x);
    let shaft = stroke(segment(p, b.c + dir * 7.0, tip), 0.6);
    let head = max(stroke(segment(p, tip, tip - dir * 8.0 + side * 4.0), 0.6), stroke(segment(p, tip, tip - dir * 8.0 - side * 4.0), 0.6));
    col = mix(col, vec4f(tr.accent.rgb, 1.0), max(shaft, head));
  }
  // Callout: a leader from the top-right bracket, then the numbers.
  let anchor = b.c + vec2f(half.x, -half.y);
  let knee = anchor + vec2f(18.0, -18.0);
  let end = knee + vec2f(24.0, 0.0);
  col = mix(col, vec4f(1.0), stroke(min(segment(p, anchor, knee), segment(p, knee, end)), 0.5) * 0.9);
  let origin = end + vec2f(4.0, -CH * 1.5);
  let t = p - origin;
  let labelled = (v.k % u32(max(tr.more.w, 1.0))) == 0u;
  if (!labelled && (segment(p, anchor, knee) < 3.0 || segment(p, knee, end) < 3.0)) { return col * tr.accent.w * acquire; }
  if (labelled && t.x >= 0.0 && t.y >= 0.0 && t.x < f32(TAG) * CW && t.y < CH * 3.0) {
    let line = u32(t.y / CH);
    let i = u32(t.x / CW);
    let ink = glyph(tagChar(line, i, v.k, b), vec2f(t.x - f32(i) * CW, t.y - f32(line) * CH));
    if (line == 0u && i < 5u) {
      col = vec4f(mix(tr.accent.rgb, vec3f(0.0), ink), 1.0);
    } else {
      col = mix(col, vec4f(0.92, 0.95, 1.0, 1.0), ink);
    }
  }
  return col * tr.accent.w * acquire;
}

// The chain: each tracked blob to the next tracked blob of its population.
@vertex fn linkVs(@builtin(vertex_index) i: u32, @builtin(instance_index) k: u32) -> V {
  var o: V;
  o.k = k;
  o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
  let a = blobAt(k);
  if (!a.ok) { return o; }
  let pop = k / PER_POP;
  var j = k;
  for (var s = (k % PER_POP) + 1u; s < PER_POP; s++) {
    if (blobAt(pop * PER_POP + s).ok) { j = pop * PER_POP + s; break; }
  }
  if (j == k) { return o; }
  let b = blobAt(j);
  let dir = b.c - a.c;
  let l = max(length(dir), 1e-3);
  let n = vec2f(-dir.y, dir.x) / l * 0.6;
  let c = corner(i);
  o.pos = toClip(mix(a.c, b.c, c.x) + n * (c.y * 2.0 - 1.0));
  return o;
}

@fragment fn linkFs(v: V) -> @location(0) vec4f {
  let dash = step(0.35, fract((v.pos.x + v.pos.y) / 6.0));
  return vec4f(1.0) * tr.a.w * tr.accent.w * tr.box.w * dash;
}
