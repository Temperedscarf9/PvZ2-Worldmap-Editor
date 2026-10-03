import { EventResourceDef, WorldMapEventStatus } from '../../domain/types';
import { State } from '../../core/state';
import { findFileInGlobal, getImageBitmapCached } from '../../core/resources';
import { getPinataName, PINATA_ANCHOR_Y_RATIO } from '../../utils/constants';
import { EventResourceCtx } from '../shared';

export async function resolvePinataResources(ctx: EventResourceCtx): Promise<EventResourceDef[]> {
  // China build has no pinata assets at all.
  if (State.data.isChinaVersion) return [];

  const { worldName, resolution, status } = ctx;
  const pinataWorldName = getPinataName(worldName);
  const img =
      status === WorldMapEventStatus.cleared
          ? findFileInGlobal(`images/${resolution}/initial/worldmap/spine_pinatas/pinatas_dust_spine_${pinataWorldName}.png`)
          : findFileInGlobal(`images/${resolution}/initial/worldmap/spine_pinatas/pinata_${pinataWorldName}_spine.png`);
  if (!img) return [];

  const { width, height } = await getImageBitmapCached(img);
  const image_scale = 1.0;
  return [
    {
      type: 'image',
      file: img,
      offset: {
        x: -width / 2,
        y: (-height * PINATA_ANCHOR_Y_RATIO) / image_scale,
      },
      scale: image_scale,
    },
  ];
}