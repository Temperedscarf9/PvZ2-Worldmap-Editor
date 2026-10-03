/**
 * Layer stacking constants — single source of truth for the covering-layer model.
 *
 * DOM hierarchy (true map structure):
 *
 *   #map-container                    ← camera matrix (scale · translate)
 *     .parallax-root-container[L]     ← translateX((L/10)·camera.x)
 *       .map-pieces-layer  (z=200)    ← covering context
 *         .parallax-layer-container
 *           .draw-layer-container[D]  ← islands / mapPieces
 *       .zomboss-layer     (z=400)    ← only on L=0; boss stages
 *       .path-layer        (z=600)    ← only on L=0; path tiles / beams
 *       .events-layer      (z=800)    ← covering context
 *         .parallax-layer-container
 *           .draw-layer-container[D]  ← events + doodads
 *
 * Each covering root establishes its own CSS stacking context so internal
 * z-index values never cross between mapPieces / zomboss / path / event.
 */

export const PARALLAX_LAYERS = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export const DRAW_LAYERS: readonly number[] = Object.freeze(
  Array.from({ length: 47 }, (_, i) => -36 + i)
);

export const LAYER_Z = {
  mapPieces: 200,
  zomboss: 400,
  path: 600,
  event: 800,
} as const;

export type CoveringKind = keyof typeof LAYER_Z;

const SORTED_PARALLAX = [...PARALLAX_LAYERS].sort((a, b) => b - a);

export function clampParallax(layer: number): number {
  return (PARALLAX_LAYERS as readonly number[]).includes(layer) ? layer : 0;
}

export function clampDrawLayer(layer: number): number {
  return DRAW_LAYERS.includes(layer) ? layer : 0;
}

export function groupKey(parallaxLayer: number, drawLayer: number): string {
  return `${clampParallax(parallaxLayer)}_${clampDrawLayer(drawLayer)}`;
}

/** Deterministic z-index for a parallax root — independent of insertion order. */
export function parallaxZIndex(pLayer: number): number {
  const idx = SORTED_PARALLAX.indexOf(pLayer as (typeof PARALLAX_LAYERS)[number]);
  return ((idx === -1 ? SORTED_PARALLAX.length : idx) + 1) * 10000;
}

/** Deterministic z-index for a draw-layer container inside a parallax root. */
export function drawLayerZIndex(dLayer: number): number {
  const idx = DRAW_LAYERS.indexOf(dLayer);
  return ((idx === -1 ? DRAW_LAYERS.length : idx) + 1) * 200;
}

export function sortedParallaxUsed(used: Iterable<number>): number[] {
  const set = new Set(used);
  return SORTED_PARALLAX.filter((pl) => set.has(pl));
}
