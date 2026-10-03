/**
 * Re-export scene layer constants for legacy import paths.
 * Canonical definitions live in src/scene/layers.ts.
 */
export {
  PARALLAX_LAYERS,
  DRAW_LAYERS,
  LAYER_Z,
  groupKey as getGroupKey,
  clampParallax,
  clampDrawLayer,
  parallaxZIndex,
  drawLayerZIndex,
  sortedParallaxUsed,
} from '../scene/layers';
