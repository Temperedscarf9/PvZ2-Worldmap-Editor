/**
 * Centralized resolution scale helpers.
 * Game world coordinates are authored at a 600-unit baseline;
 * texture / animation assets are authored at 1200, 1536, or 1800.
 */

/** World-position → screen/texture pixel scale (baseline 600). */
export function worldToPixel(value: number, resolution: number): number {
  return value * (resolution / 600);
}

/** Inverse of worldToPixel. */
export function pixelToWorld(value: number, resolution: number): number {
  return value * (600 / resolution);
}

/** Common animation scale for level/plant nodes (authored at 1200). */
export function animScale1200(resolution: number): number {
  return resolution / 1200;
}

/** Common animation scale for full-res / zomboss assets (authored at 1536). */
export function animScale1536(resolution: number): number {
  return resolution / 1536;
}

/**
 * Node selection / hitbox size in map pixels.
 * Authored at 100px for 1536; scales linearly with texture resolution.
 */
export function hitboxSize(resolution: number): number {
  return (resolution / 1536) * 100;
}

/** Half-hitbox — used as left/top offset so the node origin stays centered. */
export function hitboxHalf(resolution: number): number {
  return hitboxSize(resolution) / 2;
}

/** Push --hitbox-size onto :root so CSS ::after selection frames track resolution. */
export function applyHitboxCssVar(resolution: number): void {
  const size = hitboxSize(resolution);
  document.documentElement.style.setProperty('--hitbox-size', `${size}px`);
}

/** Grid-path tile placement scale (authored at 1800). */
export function gridTileScale(resolution: number): number {
  return resolution / 1800;
}

/** Linear path segment base length at 1536. */
export const LINEAR_PATH_BASE_LENGTH = 130;

/** Linear path pivot offset (half of 194px art). */
export const LINEAR_PATH_PIVOT = 97 * 2;
