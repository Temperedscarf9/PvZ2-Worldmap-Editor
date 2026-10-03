import { EventResourceDef, WorldMapEventStatus } from '../../domain/types';
import { eventNodeRuntimeMap, State } from '../../core/state';
import { findAnimInGlobal, findFileInGlobal, getImageBitmapCached } from '../../core/resources';
import { BOSS_NODE_OFFSET_HOLOGRAM, BOSS_NODE_OFFSET_STAGE, LEVEL_NODE_OFFSET } from '../../utils/constants';
import { animScale1200, animScale1536 } from '../../utils/scale';
import { EventResourceCtx, createGeneralGlyphUrl } from '../shared';

export async function resolveLevelResources(ctx: EventResourceCtx): Promise<EventResourceDef[]> {
  const { node, worldName, resolution, status } = ctx;
  const data = node.m_dataString;
  const isDanger = data.endsWith('dangerroom');
  const resList: EventResourceDef[] = [];
  const isChina = State.data.isChinaVersion;
  // International only - China has no initial/full split (see path comments below).
  const worldTag = worldName === 'egypt' || worldName === 'tutorial' ? 'initial' : 'full';

  if (isDanger) {
    // Danger room anim: China images/{res}/{worldname}/worldmap/danger_node_{worldname}/
    //                    vs intl images/{res}/{worldTag}/worldmap/danger_node_{worldname}/
    const anim = isChina
        ? findAnimInGlobal(`images/${resolution}/${worldName}/worldmap/danger_node_${worldName}/`)
        : findAnimInGlobal(`images/${resolution}/${worldTag}/worldmap/danger_node_${worldName}/`);
    // Danger icon: China images/{res}/UICommon/worldmap/danger_level_{worldname}.png
    //              vs intl images/{res}/{worldTag}/worldmap/danger_level_{worldname}.png
    const dangerIconPath = isChina
        ? `images/${resolution}/UICommon/worldmap/danger_level_${worldName}.png`
        : `images/${resolution}/${worldTag}/worldmap/danger_level_${worldName}.png`;
    const dangerIconFile = findFileInGlobal(dangerIconPath);
    const options: any = {};
    const isFutureCamelCase = !State.data.isLinear && worldName === 'future';

    if (status === WorldMapEventStatus.cleared || status === WorldMapEventStatus.unlocked) {
      options.label = isFutureCamelCase ? 'Unlocked_Idle' : 'unlocked_idle';
    } else {
      if (isFutureCamelCase) {
        options.probabilityBucket = { Locked_Idle: 99, Locked_Idle1: 1 };
      } else {
        options.label = 'locked_idle';
      }
    }
    if (dangerIconFile) {
      const bitmap = await getImageBitmapCached(dangerIconFile);
      const w = bitmap.width, h = bitmap.height;
      const k = resolution / 600;                           // 常规修正值
      // 文档 3.1.1：居中后平移 (-2k, 45k)，scale=1
      const offsetX = -w / 2 - 2 * k;
      const offsetY = -h / 2 + 45 * k;

      if (anim) {
        resList.push({
          type: 'animation',
          animData: anim,
          options,
          offset: { x: -98 * 2, y: -104 * 2 },
          scale: animScale1200(resolution),
        });
      }
      if (status === WorldMapEventStatus.cleared) {
        resList.push({
          type: 'image',
          file: dangerIconFile,
          offset: { x: offsetX, y: offsetY },
          scale: 1,
        });


        const textStr = node.m_displayText==''?'10002':node.m_displayText;
        const fontSize = 20 * k;
        const textImg = await createGeneralGlyphUrl(
            textStr as string,
            fontSize,
            '#ffffff',
            '#000000'
        );
        if (textImg.url) {
          const textOffsetX = -textImg.w / 2 - 2 * k;
          const textOffsetY = -textImg.h / 2 + 45 * k;
          resList.push({
            type: 'composited-image',
            url: textImg.url,
            offset: { x: textOffsetX, y: textOffsetY },
            scale: 1,
          });
        }
      }
    } else {
      if (anim) {
        resList.push({
          type: 'animation',
          animData: anim,
          options,
          offset: { x: -98 * 2, y: -104 * 2 },
          scale: animScale1200(resolution),
        });
      }
    }

    return resList;
  }

  const levelNodeType = node.m_levelNodeType || 'normal';

  if (levelNodeType === 'normal' || levelNodeType === 'minigame') {
    // Normal level: China images/{res}/UICommon/worldmap/level_node/
    //               vs intl images/{res}/initial/worldmap/level_node/
    // minigame wasn't in the given spec - assumed to follow the same UICommon substitution as
    // the (given) normal-level path, since both are shared/static (not per-world) content.
    const animPath = isChina
        ? (levelNodeType === 'minigame'
            ? `images/${resolution}/UICommon/worldmap/level_node_minigame/`
            : `images/${resolution}/UICommon/worldmap/level_node/`)
        : (levelNodeType === 'minigame'
            ? `images/${resolution}/initial/worldmap/level_node_minigame/`
            : `images/${resolution}/initial/worldmap/level_node/`);
    const anim = findAnimInGlobal(animPath);
    if (anim) {
      const options: any = {};
      if (status === WorldMapEventStatus.cleared) {
        options.label = 'finished';
      } else if (status === WorldMapEventStatus.unlocked) {
        options.label = 'unlocked';
      } else {
        if (!State.data.isLinear) {
          options.probabilityBucket = { locked_idle: 1, locked_idle2: 99 };
        } else {
          options.label = 'locked_idle';
        }
      }
      resList.push({
        type: 'animation',
        animData: anim,
        options,
        offset: LEVEL_NODE_OFFSET,
        scale: animScale1200(resolution),
      });
    }
  } else if (levelNodeType === 'miniboss') {
    // China images/{res}/UICommon/worldmap/level_node_gargantuar/
    // vs intl images/{res}/initial/worldmap/level_node_gargantuar/
    const anim = isChina
        ? findAnimInGlobal(`images/${resolution}/UICommon/worldmap/level_node_gargantuar/`)
        : findAnimInGlobal(`images/${resolution}/initial/worldmap/level_node_gargantuar/`);
    if (anim) {
      resList.push({
        type: 'animation',
        animData: anim,
        options: {
          label:
              status === WorldMapEventStatus.cleared
                  ? 'finished'
                  : status === WorldMapEventStatus.unlocked
                      ? 'unlocked'
                      : 'locked_idle',
        },
        offset: LEVEL_NODE_OFFSET,
        scale: animScale1200(resolution),
      });
    }
  } else if (levelNodeType === 'nonfinalboss') {
    // Gargantuar always; no stage. Hologram only if this is the lowest boss-type node on
    // the unlocked inheritance chain (runtime.renderHologramNode).
    const anim = isChina
        ? findAnimInGlobal(`images/${resolution}/UICommon/worldmap/level_node_gargantuar/`)
        : findAnimInGlobal(`images/${resolution}/initial/worldmap/level_node_gargantuar/`);
    if (anim) {
      resList.push({
        type: 'animation',
        animData: anim,
        options: {
          label:
              status === WorldMapEventStatus.cleared
                  ? 'finished'
                  : status === WorldMapEventStatus.unlocked
                      ? 'unlocked'
                      : 'locked_idle',
        },
        offset: LEVEL_NODE_OFFSET,
        scale: animScale1200(resolution),
      });
    }
    const runtime = eventNodeRuntimeMap.get(node);
    // locked never; only lowest on unlocked/cleared chain (renderHologramNode).
    if (
      runtime?.renderHologramNode &&
      (status === WorldMapEventStatus.unlocked || status === WorldMapEventStatus.cleared)
    ) {
      const animHologram = isChina
          ? findAnimInGlobal(`images/${resolution}/UICommon/worldmap/zomboss_node_hologram/`)
          : findAnimInGlobal(`images/${resolution}/initial/worldmap/zomboss_node_hologram/`);
      if (animHologram) {
        resList.push({
          type: 'animation',
          animData: animHologram,
          options: { label: status === WorldMapEventStatus.cleared ? 'defeated' : 'idle' },
          offset: BOSS_NODE_OFFSET_HOLOGRAM,
          scale: animScale1536(resolution),
        });
      }
    }
  } else if (levelNodeType === 'boss') {
    // Gargantuar always; stage gated by renderZombossNode; hologram only on the lowest
    // boss|nonfinalboss of the unlocked inheritance chain (renderHologramNode).
    const animStage = isChina
        ? findAnimInGlobal(`images/${resolution}/${worldName}/worldmap/zomboss_node_${worldName}/`)
        : findAnimInGlobal(`images/${resolution}/${worldTag}/worldmap/zomboss_node_${worldName}/`);
    const animGargantuar = isChina
        ? findAnimInGlobal(`images/${resolution}/UICommon/worldmap/level_node_gargantuar/`)
        : findAnimInGlobal(`images/${resolution}/initial/worldmap/level_node_gargantuar/`);
    const animHologram = isChina
        ? findAnimInGlobal(`images/${resolution}/UICommon/worldmap/zomboss_node_hologram/`)
        : findAnimInGlobal(`images/${resolution}/initial/worldmap/zomboss_node_hologram/`);
    const labelGargantuar =
        status === WorldMapEventStatus.cleared
            ? 'finished'
            : status === WorldMapEventStatus.unlocked
                ? 'unlocked'
                : 'locked_idle';
    let labelStage: string;
    if (worldName === 'lostcity') {
      labelStage = status === WorldMapEventStatus.cleared ? 'Defeated' : status === WorldMapEventStatus.unlocked ? 'Active' : 'inactive';
    } else {
      labelStage = status === WorldMapEventStatus.cleared ? 'defeated' : status === WorldMapEventStatus.unlocked ? 'active' : 'inactive';
    }

    const runtime = eventNodeRuntimeMap.get(node);
    const renderZomboss = runtime?.renderZombossNode;
    // Stage only when hierarchy allows (undefined = single-boss / non-linear → show).
    if (animStage && renderZomboss !== false) {
      resList.push({
        type: 'animation',
        animData: animStage,
        options: { label: labelStage },
        offset: BOSS_NODE_OFFSET_STAGE,
        scale: animScale1536(resolution),
      });
    }
    if (animGargantuar) {
      resList.push({
        type: 'animation',
        animData: animGargantuar,
        options: { label: labelGargantuar },
        offset: LEVEL_NODE_OFFSET,
        scale: animScale1200(resolution),
      });
    }
    // locked never; only lowest on unlocked/cleared chain (renderHologramNode).
    if (
      runtime?.renderHologramNode &&
      animHologram &&
      (status === WorldMapEventStatus.unlocked || status === WorldMapEventStatus.cleared)
    ) {
      resList.push({
        type: 'animation',
        animData: animHologram,
        options: { label: status === WorldMapEventStatus.cleared ? 'defeated' : 'idle' },
        offset: BOSS_NODE_OFFSET_HOLOGRAM,
        scale: animScale1536(resolution),
      });
    }
  }

  if ((levelNodeType !== 'boss') && (levelNodeType !== 'nonfinalboss')) {
    const textStr = node.m_displayText;
    if (textStr) {
      const k = resolution / 600;
      const fontSize = 28 * k;
      const textImg = await createGeneralGlyphUrl(
          textStr,
          fontSize,
          '#ffffff',
          '#000000'
      );
      if (textImg.url) {
        const textOffsetX = -textImg.w / 2 - 2 * k;
        const textOffsetY = -textImg.h / 2 - 30 * k;
        resList.push({
          type: 'composited-image',
          url: textImg.url,
          offset: { x: textOffsetX, y: textOffsetY },
          scale: 1,
        });
      }
    }
  }

  return resList;
}