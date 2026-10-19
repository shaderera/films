// The Lorenz attractor's trajectory, integrated once in open with fixed-step RK4 (σ 10, ρ 28, β 8/3),
// so the same points every run. Centred on its mean and stored as xyz (z up becomes y) and speed.

export const ATTRACTOR_POINTS = 1 << 17

export const lorenz = () => {
  const out = new Float32Array(ATTRACTOR_POINTS * 4)
  const f = (x: number, y: number, z: number) => [10 * (y - x), x * (28 - z) - y, x * y - (8 / 3) * z]
  let x = 0.1, y = 0, z = 0
  const dt = 0.004
  const step = () => {
    const [a1, b1, c1] = f(x, y, z)
    const [a2, b2, c2] = f(x + (dt / 2) * a1, y + (dt / 2) * b1, z + (dt / 2) * c1)
    const [a3, b3, c3] = f(x + (dt / 2) * a2, y + (dt / 2) * b2, z + (dt / 2) * c2)
    const [a4, b4, c4] = f(x + dt * a3, y + dt * b3, z + dt * c3)
    x += (dt / 6) * (a1 + 2 * a2 + 2 * a3 + a4)
    y += (dt / 6) * (b1 + 2 * b2 + 2 * b3 + b4)
    z += (dt / 6) * (c1 + 2 * c2 + 2 * c3 + c4)
  }
  for (let i = 0; i < 4000; i++) step()
  for (let i = 0; i < ATTRACTOR_POINTS; i++) {
    step()
    const [dx, dy, dz] = f(x, y, z)
    out.set([x, z - 23.5, y, Math.min(1, Math.hypot(dx, dy, dz) / 250)], i * 4)
  }
  return out
}
