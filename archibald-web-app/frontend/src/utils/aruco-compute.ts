type Corner = { x: number; y: number }

export function computePxPerMm(corners: Corner[]): number {
  const sides = [
    Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y),
    Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y),
    Math.hypot(corners[3].x - corners[2].x, corners[3].y - corners[2].y),
    Math.hypot(corners[0].x - corners[3].x, corners[0].y - corners[3].y),
  ]
  return sides.reduce((a, b) => a + b, 0) / 4 / 20.0
}
