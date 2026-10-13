// Dashed lines along a polyline: whole dashes of `dash` with gaps of `gap` (world pixels), the pattern running on
// across corners. Each step either finishes the current edge or uses up the current dash or gap, so floating-point
// error cannot stall it (a loop over `t += step` with a modulo phase could take steps too small to move `t` and
// hang the tab, which is what happened at 3× zoom).

export function dashes(points: { x: number; y: number }[], dash: number, gap: number, closed: boolean, draw: (x0: number, y0: number, x1: number, y1: number) => void) {
  if (!(dash > 0) || !(gap > 0) || points.length < 2) return
  let on = true
  let left = dash
  const edges = closed ? points.length : points.length - 1
  for (let i = 0; i < edges; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (!(length > 0)) continue
    let rest = length
    while (rest > 0) {
      const step = Math.min(left, rest)
      if (on) {
        const t0 = (length - rest) / length
        const t1 = (length - rest + step) / length
        draw(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1)
      }
      rest = step === rest ? 0 : rest - step
      left -= step
      if (left <= 1e-9) {
        on = !on
        left = on ? dash : gap
      }
    }
  }
}
