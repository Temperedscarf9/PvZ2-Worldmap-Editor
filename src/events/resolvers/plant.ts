import { EventResourceDef, WorldMapEventStatus } from '../../domain/types';
import { State } from '../../core/state';
import { findAnimInGlobal } from '../../core/resources';
import {
  getPreloadedPlantPacket,
  getPlantAnimFolder,
  getPlantAnimOffset,
  getCanonicalPlantTypeName,
  sproutAnimPath,
} from '../../core/resources/plantTypes';
import {
  PLANT_OFFSET,
  PACKET_ANCHOR_Y_RATIO,
  getPlantResourceName,
} from '../../utils/constants';
import { animScale1200 } from '../../utils/scale';
import { EventResourceCtx, getAnimationProbabilityBucket } from '../shared';

/**
 * Resolve visual resources for a plant / plantbox node.
 * Packets and plant animations are served from the start-time preload cache
 * (see plantTypes.preloadAllPlantAssets); this path no longer composes on the fly
 * from the live worldmap event list.
 *
 * Offsets:
 * - sprout / packet: PLANT_OFFSET / packet anchors
 * - plant pop anim only: -2 * ArtCenter via getPlantAnimOffset (fallback PLANT_OFFSET)
 */
export async function resolvePlantResources(ctx: EventResourceCtx): Promise<EventResourceDef[]> {
  const { node, worldName, resolution, status } = ctx;
  const data = node.m_dataString || '';
  // Canonicalize once, here - m_dataString isn't guaranteed to already be a clean TypeName
  // (could be an alias); every lookup below shares this one resolved identity instead of each
  // independently guessing at what `data` actually is.
  const typeName = data ? getCanonicalPlantTypeName(data) : '';
  const resList: EventResourceDef[] = [];
  const animsprout = findAnimInGlobal(sproutAnimPath(resolution));

  if (status === WorldMapEventStatus.locked) {
    // plant nodes show a seed packet; plantbox nodes only show the sprout
    const needPacket = node.m_eventType === 'plant';

    if (needPacket) {
      if (animsprout) {
        resList.push({
          type: 'animation',
          animData: animsprout,
          options: { label: 'idle2' },
          offset: PLANT_OFFSET,
          scale: animScale1200(resolution),
        });
      }

      if (typeName) {
        const composed = await getPreloadedPlantPacket(typeName, worldName, resolution);
        if (composed) {
          const image_scale = 0.78125;
          resList.push({
            type: 'composited-image',
            url: composed.url,
            offset: {
              x: -composed.width / 2,
              y: (-composed.height * PACKET_ANCHOR_Y_RATIO) / image_scale,
            },
            scale: image_scale,
          });
        }
      }
    } else {
      if (animsprout) {
        resList.push({
          type: 'animation',
          animData: animsprout,
          options: { label: 'idle' },
          offset: PLANT_OFFSET,
          scale: animScale1200(resolution),
        });
      }
    }
  } else if (status === WorldMapEventStatus.cleared) {
    // Probability buckets and on-disk anim folders are both keyed by PLANT_NAME_MAP[typeName]
    // (getPlantResourceName) — never raw TypeName, including China.
    const animName = getPlantResourceName(typeName);
    const anim = typeName ? getPlantAnimFolder(typeName, resolution) : null;

    const plantOptions: any = {};
    const bucket = getAnimationProbabilityBucket(animName);
    if (bucket) {
      plantOptions.probabilityBucket = bucket;
    } else {
      plantOptions.label = 'idle';
    }

    if (animsprout) {
      resList.push({
        type: 'animation',
        animData: animsprout,
        options: { label: 'idle2' },
        offset: PLANT_OFFSET,
        scale: animScale1200(resolution),
      });
    }
    if (anim) {
      // Plant pop only — getPlantAnimOffset = -2 * ArtCenter from PlantProperties.json
      const plantOffset = getPlantAnimOffset(typeName);
      resList.push({
        type: 'animation',
        animData: anim,
        options: plantOptions,
        offset: plantOffset,
        scale: animScale1200(resolution),
      });
    }
  }
  return resList;
}