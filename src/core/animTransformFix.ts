import { State } from './state';
import { getUsesRasterizedImagesInAnim } from './worldMeta';

export type AnimFix = { k: number; s: number };

/** Documented constants from worldmaplist UsesRasterizedImagesInAnim rules. */
const S_RASTERIZED = 1;
const K_RASTERIZED = 1536 / 600; // ≈ 2.56
const S_NON_RASTERIZED = 1536 / 1200; // 1.28
const K_NON_RASTERIZED = 2;

/** Default when no AnimationDetails entry exists (same as non-rasterized). */
const DEFAULT_FIX: AnimFix = { s: S_NON_RASTERIZED, k: K_NON_RASTERIZED };

/** WorldMap_Twister rift worlds (m_worldName starts with "rift"): fixed s=1, k=2. */
const RIFT_FIX: AnimFix = { s: 1, k: 2 };

/**
 * Animation island / doodad transform correction.
 *
 * Rules (from worldmaplist AnimationDetails.UsesRasterizedImagesInAnim):
 * - UsesRasterizedImagesInAnim === true  →  s = 1,         k = 1536/600
 * - UsesRasterizedImagesInAnim === false →  s = 1536/1200, k = 2
 * - no AnimationDetails entry for the anim →  s = 1536/1200, k = 2
 *
 * Special case: WorldMap_Twister rift worlds (selectedWorld starts with "rift")
 * always use s = 1, k = 2 regardless of the table.
 *
 * s  = global scale stored on the animation definition (animDef+40)
 * k  = design-space scale of the anchor / pivot
 */
export function getAnimTransformFix(animId: number): AnimFix {
  const worldName = State.data.selectedWorld;

  // Rift family (Twister resource pack) — hard override
  if (worldName && /^rift/i.test(worldName)) {
    return RIFT_FIX;
  }

  const usesRasterized = getUsesRasterizedImagesInAnim(worldName, animId);

  if (usesRasterized === true) {
    return { s: S_RASTERIZED, k: K_RASTERIZED };
  }

  // false or missing entry → non-rasterized defaults
  return DEFAULT_FIX;
}
