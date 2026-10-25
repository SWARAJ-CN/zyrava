/** Geometry helpers shared by the SVG charts. */

export type Point = [number, number];

export function smoothPath(points: Point[], tension = 0.2): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;

  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] ?? next;

    let control1Y = current[1] + (next[1] - previous[1]) * tension;
    let control2Y = next[1] - (after[1] - current[1]) * tension;

    // Keep the curve inside the segment so it never dips below zero.
    const low = Math.min(current[1], next[1]);
    const high = Math.max(current[1], next[1]);
    control1Y = Math.min(high, Math.max(low, control1Y));
    control2Y = Math.min(high, Math.max(low, control2Y));

    const control1X = current[0] + (next[0] - previous[0]) * tension;
    const control2X = next[0] - (after[0] - current[0]) * tension;

    path += ` C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${next[0]} ${next[1]}`;
  }
  return path;
}

export function areaPath(points: Point[], baseline: number, tension = 0.2): string {
  if (points.length === 0) return "";
  const line = smoothPath(points, tension);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last[0]} ${baseline} L ${first[0]} ${baseline} Z`;
}

/** Picks indices to label so x-axis text does not collide. */
export function labelIndices(count: number, max = 8): number[] {
  if (count <= max) return Array.from({ length: count }, (_, index) => index);
  const step = Math.ceil(count / max);
  const indices: number[] = [];
  for (let index = 0; index < count; index += step) indices.push(index);
  if (indices[indices.length - 1] !== count - 1) indices.push(count - 1);
  return indices;
}
