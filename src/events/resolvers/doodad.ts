import { EventResourceDef } from '../../domain/types';
import { State } from '../../core/state';
import { getAnimTransformFix } from '../../core/animTransformFix';
import { findPieceAnim } from '../../core/resources';
import {
  fetchWorldMapListAnimationDelays,
  fetchWorldMapListAnimationDetails,
  getWorldAnimationBoundary,
} from '../../core/worldMeta';
import { animScale1536 } from '../../utils/scale';
import { EventResourceCtx } from '../shared';

export async function resolveDoodadResources(ctx: EventResourceCtx): Promise<EventResourceDef[]> {
  const { node, worldName, resolution } = ctx;
  const imageId = node.m_imageID ?? 0;
  const maxImageId = getWorldAnimationBoundary();

  const isAnimation = imageId > maxImageId;

  if (!isAnimation) {
    const assets = State.data.worlds[worldName];
    if (!assets || !assets.images) return [];

    let minI = 1;
    for (const filename of Object.keys(assets.images)) {
      const m = filename.match(/^island(\d+)\.png$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num < minI) {
          minI = num;
        }
      }
    }
    const offset = minI === 0 ? 0 : 1;
    const fileName = `island${imageId + offset}.png`;
    const file = assets.images[fileName];
    if (!file) return [];

    return [
      {
        type: 'image',
        file: file,
        offset: { x: 0, y: 0 },
        scale: 1,
      }
    ];
  }

  const animId = imageId - maxImageId;
  const anim = findPieceAnim(worldName, animId);
  if (!anim || !anim.json || !anim.files.length) return [];

  let delayMin: number | undefined;
  let delayMax: number | undefined;

  // Ensure AnimationDetails is warm before getAnimTransformFix reads the flag.
  if (State.data.isLinear) {
    const detailsMap = await fetchWorldMapListAnimationDetails();
    const worldDetails = detailsMap.get(worldName.toLowerCase());
    if (worldDetails) {
      const detail = worldDetails.find((d) => d.animId === animId);
      if (detail) {
        delayMin = detail.min;
        delayMax = detail.max;
      }
    }
  } else {
    const delaysMap = await fetchWorldMapListAnimationDelays();
    const worldDelays = delaysMap.get(worldName.toLowerCase());
    if (worldDelays && worldDelays[animId - 1]) {
      const delay = worldDelays[animId - 1];
      delayMin = delay.min;
      delayMax = delay.max;
    }
  }

  const fix = getAnimTransformFix(animId);

  return [
    {
      type: 'animation',
      animData: anim,
      options: {
        label: 'idle',
        delayMin,
        delayMax,
      },
      offset: { x: -97 * fix.k, y: -97 * fix.k },
      scale: animScale1536(resolution) * fix.s,
    },
  ];
}