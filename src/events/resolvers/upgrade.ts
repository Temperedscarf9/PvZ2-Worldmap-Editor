import { EventResourceDef, WorldMapEventStatus } from '../../domain/types';
import { State } from '../../core/state';
import { findAnimInGlobal, findFileInGlobal, getImageBitmapCached } from '../../core/resources';
import { UPGRADE_MAP, CHINA_MAGIC_BONUS_MAP, UPGRADE_ANCHOR_Y_RATIO } from '../../utils/constants';
import { animScale1200 } from '../../utils/scale';
import { EventResourceCtx } from '../shared';

export async function resolveUpgradeResources(ctx: EventResourceCtx): Promise<EventResourceDef[]> {
  const { node, resolution, status } = ctx;
  const data = node.m_dataString;
  const isChina = State.data.isChinaVersion;

  // China-only "magic bonus" events (drum/fertilizer/pole/regeneration/snowflake/torch) don't
  // follow the regular UPGRADE_MAP + upgrade_%s.png convention at all - see
  // CHINA_MAGIC_BONUS_MAP's doc comment. Anything not in that table (including other China
  // bonus types) falls through to the normal upgrade_%s.png path below unchanged.
  const magicValue = isChina ? CHINA_MAGIC_BONUS_MAP[data] : undefined;
  const value = UPGRADE_MAP[data];

  // China: images/{res}/UIActive/worldmap/common/upgrade_{value}.png
  // Intl:  images/{res}/initial/worldmap/common/upgrade_{value}.png
  // China magic bonus: images/{res}/UIActive/worldmap/common/magic_{value}.png (no upgrade_
  // prefix, always UIActive - this category only exists for China packs).
  const imgFile = magicValue
      ? findFileInGlobal(`images/${resolution}/UIActive/worldmap/common/magic_${magicValue}.png`)
      : findFileInGlobal(
          `images/${resolution}/${isChina ? 'UIActive' : 'initial'}/worldmap/common/upgrade_${value}.png`
      );
  if (!imgFile) return [];
  const resList: EventResourceDef[] = [];

  const { width, height } = await getImageBitmapCached(imgFile);
  const extraScale = animScale1200(resolution);
  const imageOffsetX = -(width / 2);
  const imageOffsetY = -(Math.round(resolution/600* -12)+height);//-height * UPGRADE_ANCHOR_Y_RATIO;

  if (status === WorldMapEventStatus.cleared) {
    // China: images/{res}/UIActive/effects/collected_upgrade_effect/
    // Intl:  images/{res}/initial/effects/collected_upgrade_effect/
    const effect = findAnimInGlobal(
        `images/${resolution}/${isChina ? 'UIActive' : 'initial'}/effects/collected_upgrade_effect/`
    );
    if (effect) {

      const offsetX = value === 'diamond'
          ? imageOffsetX / extraScale - 81 * 2
          : imageOffsetX / extraScale - 67 * 2;
      const offsetY = value === 'diamond'
          ? imageOffsetY / extraScale - 80 * 2
          : imageOffsetY / extraScale - 71 * 2;

      resList.push({
        type: 'animation',
        animData: effect,
        options: { label: 'idle' },
        offset: { x: offsetX, y: offsetY },
        scale: extraScale,
      });
    }
  }

  resList.push({ type: 'image', file: imgFile, offset: { x: imageOffsetX, y: imageOffsetY } });
  return resList;
}