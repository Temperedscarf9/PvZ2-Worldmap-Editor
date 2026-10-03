import { EventResourceDef, MapEventNode, WorldMapEventStatus } from '../../domain/types';
import { State } from '../../core/state';
import { findAnimInGlobal, findFileInGlobal, getImageBitmapCached } from '../../core/resources';
import { KEY_GATE_OFFSET } from '../../utils/constants';
import { animScale1536 } from '../../utils/scale';
import { EventResourceCtx, createKeyGateTextDataUrl } from '../shared';

export async function resolveKeyGateResources(ctx: EventResourceCtx): Promise<EventResourceDef[]> {
  const { node, worldName, resolution, status } = ctx;
  const isChina = State.data.isChinaVersion;
  const worldTag = worldName === 'egypt' || worldName === 'tutorial' ? 'initial' : 'full';
  const resList: EventResourceDef[] = [];
  const s = resolution / 600;

  // 2. 旗帜及附属图像（先渲染，作为底层）
  // China: images/{res}/UICommon/worldmap/keygate_flag.png
  // Intl:  images/{res}/initial/worldmap/keygate_flag.png
  const flagFile = findFileInGlobal(
      `images/${resolution}/${isChina ? 'UICommon' : 'initial'}/worldmap/keygate_flag.png`
  );
  if (flagFile) {
    const parentName = node.m_parentEvent;
    let parentNode: MapEventNode | undefined;
    if (parentName) {
      const eventList = State.data.mapConfig?.objdata?.m_eventList || [];
      parentNode = eventList.find(n => n.m_name === parentName);
    }
    const parentX = parentNode?.m_position?.x ?? 0;
    const diff = parentX - (node.m_position?.x ?? 0);
    const isFlipped = node.m_isArtFlipped || false;

    // 分支相关系数，对应 case7 的两组 v157~v163
    let flagOffX: number, flagOffY: number;
    let keyRelXConst: number, keyRelYConst: number;   // v161, v162
    let numRelXConst: number, numRelYConst: number;   // v157, v159

    if (diff < 1) {
      // 对应 v157=-8, v158=70, v159=4, v160=63/41, v161=16, v162=7
      if (!isFlipped) { flagOffX = -70 * s; flagOffY = -63 * s; }
      else            { flagOffX = -70 * s; flagOffY = -41 * s; }
      keyRelXConst = 16 * s;
      keyRelYConst = 7 * s;
      numRelXConst = -8 * s;
      numRelYConst = 4 * s;
    } else {
      // 对应 v157=-4, v158=-20/-38, v159=5, v160=41/63, v161=20, v162=4
      if (!isFlipped) { flagOffX = 20 * s; flagOffY = -41 * s; }
      else            { flagOffX = 38 * s; flagOffY = -63 * s; }
      keyRelXConst = 20 * s;
      keyRelYConst = 4 * s;
      numRelXConst = -4 * s;
      numRelYConst = 5 * s;
    }

    // 2.1 旗帜本身（scale=1，offset本身就是最终像素位移）
    resList.push({
      type: 'image',
      file: flagFile,
      offset: { x: flagOffX, y: flagOffY },
      scale: 1,
      flipX: diff<1
    });

    // 2.2 info_icon（仅 cleared 状态）—— 系数(18,8)是固定的，不随分支变化
    // China: images/{res}/UICommon/worldmap/info_icon.png
    // Intl:  images/{res}/initial/worldmap/info_icon.png
    if (status === WorldMapEventStatus.cleared) {
      const infoFile = findFileInGlobal(
          `images/${resolution}/${isChina ? 'UICommon' : 'initial'}/worldmap/info_icon.png`
      );
      if (infoFile) {
        const infoScale = (20 * s * 1536) / (117 * resolution);
        const finalPixelX = flagOffX + 18 * s;
        const finalPixelY = flagOffY + 8 * s;
        resList.push({
          type: 'image',
          file: infoFile,
          offset: { x: finalPixelX / infoScale, y: finalPixelY / infoScale },
          scale: infoScale,
        });
      }
    }

    // 2.3 icon_key + 数字（仅 locked 状态）
    if (status === WorldMapEventStatus.locked) {
      // China: a single fixed images/{res}/UIActive/UI/hud_worldmap/icon_key_.png - no
      // per-world variant or fallback (unlike international's two-step lookup below).
      let keyFile: File | null;
      if (isChina) {
        keyFile = findFileInGlobal(`images/${resolution}/UIActive/UI/hud_worldmap/icon_key_${worldName}.png`);
      } else {
        let keyPath = `images/${resolution}/initial/UI/hud_worldmap/icon_key_${worldName}.png`;
        keyFile = findFileInGlobal(keyPath);
        if (!keyFile) {
          keyPath = `images/${resolution}/initial/UI/hud_worldmap/icon_key.png`;
          keyFile = findFileInGlobal(keyPath);
        }
      }
      if (keyFile) {
        const keyBitmap = await getImageBitmapCached(keyFile);
        const w = keyBitmap.width;
        const h = keyBitmap.height;
        const keyScale = 0.5*120/h; // 对应 (float)v309 * 0.5

        // X = flagOff + v161*s - w/4   （-w/4 即 (v309*0.5)/2，钥匙对自身宽度的居中修正）
        // Y = flagOff + v162*s
        const finalPixelX = flagOffX + keyRelXConst - w*(120/h) / 4;
        const finalPixelY = flagOffY + keyRelYConst;
        resList.push({
          type: 'image',
          file: keyFile,
          offset: { x: finalPixelX / keyScale, y: finalPixelY / keyScale },
          scale: keyScale,
        });
        // const flagBitmap = await getImageBitmapCached(flagFile);
        // const flag_width = flagBitmap.width;
        const numX = flagOffX  + numRelXConst + 80 * 0.5 * s;
        const numY = flagOffY + numRelYConst;
        const textStr = String(node.m_cost ?? 0);
        const fontSize = 21.5 * s;
        const textImg = await createKeyGateTextDataUrl(textStr, fontSize, 'rgba(0, 113, 140, 1)', '#ffffff', s);
        if (textImg.url) {
          resList.push({
            type: 'composited-image',
            url: textImg.url,
            offset: { x: numX - textImg.w/2, y: numY+textImg.pad * s * 0.5 },
            scale: 1,
          });
        }
      }
    }
  }

  // 1. key_gate 动画（后渲染，覆盖在旗帜/图标之上）
  // China: images/{res}/{worldname}/worldmap/gate_{worldname}/ (per-world, no worldTag)
  // Intl:  images/{res}/{worldTag}/worldmap/gate_{worldname}/
  const anim = isChina
      ? findAnimInGlobal(`images/${resolution}/${worldName}/worldmap/gate_${worldName}/`)
      : findAnimInGlobal(`images/${resolution}/${worldTag}/worldmap/gate_${worldName}/`);
  if (anim) {
    const prefix = node.m_isArtFlipped ? 'gate_right_' : 'gate_left_';
    const label = status === WorldMapEventStatus.cleared ? prefix + 'unlocked' : prefix + 'locked';
    resList.push({
      type: 'animation',
      animData: anim,
      options: { label },
      offset: KEY_GATE_OFFSET,
      scale: animScale1536(resolution),
    });
  }

  return resList;
}