// From the summed light to the frame: halation from a quarter-resolution bright pass, a filmic
// shoulder, vignette and grain.

struct Post {
  a: vec4f,  // exposure, bloom, frame, flash
  b: vec4f,  // vignette, grain, black lift, 0
  c: vec4f,  // look (0 none, 1 ascii, 2 halftone, 3 dither, 4 heat, 5 contours, 6 pixels, 7 inverse), amount, cell px, seed
  d: vec4f,  // glitch: share of rows thrown, seed, share of thrown rows sorted, throw (uv)
  e: vec4f,  // black hole on screen: centre x, y (px), horizon radius (px), lensing strength
}

@group(0) @binding(0) var<uniform> u: Post;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var lin: sampler;
@group(0) @binding(3) var glow: texture_2d<f32>;
@group(0) @binding(4) var atlas: texture_2d<f32>;

struct V { @builtin(position) pos: vec4f, @location(0) uv: vec2f }

@vertex fn fullVs(@builtin(vertex_index) i: u32) -> V {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: V;
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}

@fragment fn brightFs(i: V) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(src));
  var c = vec3f(0.0);
  for (var y = -1.5; y <= 1.5; y += 1.0) {
    for (var x = -1.5; x <= 1.5; x += 1.0) {
      c += textureSampleLevel(src, lin, i.uv + vec2f(x, y) / size, 0.0).rgb;
    }
  }
  c /= 16.0;
  let l = max(c.r, max(c.g, c.b));
  return vec4f(c * smoothstep(0.35, 2.0, l), 1.0);
}

const W = array(0.2270270, 0.1945946, 0.1216216, 0.0540541, 0.0162162);

fn blur(uv: vec2f, dir: vec2f) -> vec4f {
  let size = vec2f(textureDimensions(src));
  var c = textureSampleLevel(src, lin, uv, 0.0).rgb * W[0];
  for (var k = 1; k < 5; k++) {
    let o = dir * f32(k) * 2.2 / size;
    c += textureSampleLevel(src, lin, uv + o, 0.0).rgb * W[k];
    c += textureSampleLevel(src, lin, uv - o, 0.0).rgb * W[k];
  }
  return vec4f(c, 1.0);
}

@fragment fn blurXFs(i: V) -> @location(0) vec4f { return blur(i.uv, vec2f(1.0, 0.0)); }
@fragment fn blurYFs(i: V) -> @location(0) vec4f { return blur(i.uv, vec2f(0.0, 1.0)); }

fn hash(p: vec3f) -> f32 {
  var q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn tone(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn srgb(x: vec3f) -> vec3f {
  return select(1.055 * pow(x, vec3f(1.0 / 2.4)) - 0.055, x * 12.92, x <= vec3f(0.0031308));
}

fn rowHash(r: f32, seed: f32) -> f32 { return hash(vec3f(r, seed, 7.0)); }

// The finished, tone-mapped scene at uv (linear, 0–1).
fn scene(uv: vec2f) -> vec3f {
  let s = textureSampleLevel(src, lin, uv, 0.0).rgb;
  let g = textureSampleLevel(glow, lin, uv, 0.0).rgb;
  return tone((s + g * u.a.y) * u.a.x + vec3f(u.a.w));
}

fn heat(t0: f32) -> vec3f {
  let t = clamp(t0, 0.0, 1.0) * 4.0;
  let k = array(vec3f(0.0, 0.0, 0.03), vec3f(0.22, 0.03, 0.48), vec3f(0.86, 0.12, 0.38), vec3f(1.0, 0.55, 0.08), vec3f(1.0, 0.98, 0.86));
  let i = min(u32(t), 3u);
  return mix(k[i], k[i + 1u], t - f32(i));
}

fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.3, 0.59, 0.11)); }

fn bayer(p: vec2u) -> f32 {
  let m = array(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[(p.y % 4u) * 4u + p.x % 4u] + 0.5) / 16.0;
}

// The same frame in another medium. Cell-based looks read the scene once per cell.
fn look(uv: vec2f, px: vec2f, c: vec3f) -> vec3f {
  let mode = i32(u.c.x + 0.5);
  let size = vec2f(textureDimensions(src));
  let cell = max(u.c.z, 2.0);
  if (mode == 1) {
    // ASCII: each 10 × 18 cell is the glyph whose ink matches the cell's light.
    let cs = vec2f(10.0, 18.0);
    let id = floor(px / cs);
    // The cell's light, averaged over a 3 × 3 sample of it, so sparse points still register.
    var sum = 0.0;
    for (var y = 0; y < 3; y++) {
      for (var x = 0; x < 3; x++) { sum += luma(scene((id + (vec2f(f32(x), f32(y)) + 0.5) / 3.0) * cs / size)); }
    }
    let lum = min(sum / 9.0 * 1.8, 1.0);
    let ramp = array(32u, 46u, 58u, 45u, 61u, 43u, 42u, 35u, 37u, 64u);
    let ch = ramp[min(u32(pow(lum, 0.7) * 10.0), 9u)];
    let at = vec2u(px - id * cs);
    let ink = textureLoad(atlas, vec2u((ch % 16u) * 10u, ((ch - 32u) / 16u) * 18u) + at, 0).r;
    return vec3f(ink) * mix(vec3f(0.85, 0.92, 1.0), heat(lum), 0.35) * min(lum * 3.0 + 0.2, 1.0);
  }
  if (mode == 2) {
    // Halftone at 45°: one dot per cell, its area the cell's light.
    let r = mat2x2f(0.7071, -0.7071, 0.7071, 0.7071);
    let q = r * px;
    let id = floor(q / cell);
    let centre = (id + 0.5) * cell;
    let lum = luma(scene((transpose(r) * centre) / size));
    let rad = sqrt(lum) * cell * 0.62;
    return vec3f(smoothstep(rad + 0.7, rad - 0.7, length(q - centre)));
  }
  if (mode == 3) {
    // One bit: ordered dither, steel and black.
    let lum = luma(c);
    return vec3f(step(bayer(vec2u(px / 2.0)), pow(lum, 0.8))) * vec3f(0.88, 0.93, 1.0);
  }
  if (mode == 4) { return heat(pow(luma(c), 0.6) * 1.15); }
  if (mode == 5) {
    let lum = luma(c);
    let f = fract(lum * 12.0);
    return vec3f(1.0, 0.24, 0.06) * step(0.86, f) * step(0.02, lum) + c * 0.15;
  }
  if (mode == 6) { return scene((floor(px / cell) + 0.5) * cell / size); }
  if (mode == 7) { return vec3f(1.0) - c; }
  return c;
}

@fragment fn finalFs(i: V) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(src));
  var uv = i.uv;
  var px = i.pos.xy;
  // Glitch: rows of the frame are thrown sideways, and some of those are sorted (smeared to their
  // brightest neighbour on the left).
  var sorted = false;
  if (u.d.x > 0.0) {
    let rowH = 6.0 + 42.0 * rowHash(floor(px.y / 48.0), u.d.y + 3.0);
    let row = floor(px.y / rowH);
    let h = rowHash(row, u.d.y);
    if (h < u.d.x) {
      uv.x = fract(uv.x + (rowHash(row, u.d.y + 1.0) - 0.5) * u.d.w);
      px.x = uv.x * size.x;
      sorted = rowHash(row, u.d.y + 2.0) < u.d.z;
    }
  }
  // Gravitational lensing: outside the horizon, each pixel sees light from nearer the hole, so the
  // disk behind it is pulled into a ring and the stars bunch at its edge.
  if (u.e.w > 0.0 && u.e.z > 0.5) {
    let d = px - u.e.xy;
    let r = length(d);
    let R = u.e.z;
    if (r > R) {
      let src = max(r - u.e.w * R * R / r, 0.0);
      uv = (u.e.xy + d / r * src) / size;
    }
  }
  var c = scene(uv);
  if (sorted) {
    for (var k = 1; k <= 24; k++) { c = max(c, scene(uv - vec2f(f32(k * k) * 0.6 / size.x, 0.0)) * (1.0 - f32(k) / 26.0)); }
  }
  if (u.c.y > 0.0) { c = mix(c, look(uv, px, c), u.c.y); }
  let q = i.uv - 0.5;
  c *= 1.0 - u.b.x * dot(q, q) * 1.6;
  c = c + u.b.z * (1.0 - c) * vec3f(0.85, 0.9, 1.0) * 0.02;
  let n = hash(vec3f(i.pos.xy, u.a.z)) - 0.5;
  c = srgb(clamp(c, vec3f(0.0), vec3f(1.0))) + n * u.b.y;
  return vec4f(c, 1.0);
}
