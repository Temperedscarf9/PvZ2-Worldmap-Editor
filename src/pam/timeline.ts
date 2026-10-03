import { transformToMatrix, multiplyMatrix } from './model';
import type { Animation, Color, Matrix6, LayerSnapshot, SpriteTimeline, TimelinesMap, Sprite } from './types';

const DEFAULT_COLOR: Color = { r: 1, g: 1, b: 1, a: 1 };
const IDENTITY_MATRIX: Matrix6 = [1, 0, 0, 1, 0, 0];

export function moduloFrameIndex(value: number, count: number): number {
  return ((value % count) + count) % count;
}

export interface TimelineSnapshotResult {
  spriteData: Sprite;
  actualFrame: number;
  snapshot: LayerSnapshot[];
}

export function getTimelineSnapshot(
    animation: Animation,
    timelines: TimelinesMap,
    spriteIndex: number,
    frameIndex: number,
): TimelineSnapshotResult | null {
  const timelineKey = spriteIndex === -1 ? 'main' : spriteIndex;
  const timeline = timelines[timelineKey];
  if (!timeline) return null;

  const spriteData = spriteIndex === -1 ? animation.mainSprite : animation.sprite[spriteIndex];
  if (!spriteData || spriteData.frame.length === 0) return null;

  const actualFrame = moduloFrameIndex(frameIndex, spriteData.frame.length);
  const snapshot = timeline[actualFrame];
  if (!snapshot) return null;

  return { spriteData, actualFrame, snapshot };
}


export function buildSpriteTimeline(animation: Animation, sprite: Animation['sprite'][0]): SpriteTimeline {
  const layers = new Map<number, {
    resource: number;
    isSprite: boolean;
    additive: boolean;
    timeScale: number;
    preloadFrame: number;
    firstFrame: number;
    transform: Matrix6;
    color: Color;
    removed: boolean;
    changed: boolean;
    spriteFrameNumber: number | null;
    sourceRect: [number, number, number, number] | null;
  }>();
  const timeline: SpriteTimeline = [];

  for (let fi = 0; fi < sprite.frame.length; fi++) {
    const frame = sprite.frame[fi];

    for (const action of frame.remove) {
      const layer = layers.get(action.index);
      if (layer) layer.removed = true;
    }

    for (const action of frame.append) {
      layers.set(action.index, {
        resource: action.resource,
        isSprite: action.sprite,
        additive: action.additive,
        timeScale: action.timeScale,
        preloadFrame: action.preloadFrame,
        firstFrame: fi,
        transform: IDENTITY_MATRIX,
        color: { ...DEFAULT_COLOR },
        removed: false,
        changed: true,
        spriteFrameNumber: null,
        sourceRect: null,
      });
    }

    for (const action of frame.change) {
      const layer = layers.get(action.index);
      if (!layer || layer.removed) continue;
      layer.transform = transformToMatrix(action.transform);
      if (action.color) {
        layer.color = action.color;
      }
      if (action.spriteFrameNumber != null && layer.isSprite) {
        const childSprite = layer.resource === animation.sprite.length
            ? animation.mainSprite
            : animation.sprite[layer.resource];
        if (childSprite) {
          const childCount = childSprite.frame.length;
          const scaledDelta = Math.floor((fi - layer.firstFrame) * layer.timeScale);
          const frameOffset = action.spriteFrameNumber - scaledDelta;
          layer.preloadFrame = ((frameOffset % childCount) + childCount) % childCount;
        }
      }
      if (action.sourceRectangle != null) {
        layer.sourceRect = [...action.sourceRectangle] as [number, number, number, number];
      }
      layer.changed = true;
    }

    const sortedKeys: number[] = [];
    layers.forEach((_, key) => {
      sortedKeys.push(key);
    });
    sortedKeys.sort((a, b) => a - b);

    const snapshot: LayerSnapshot[] = [];
    for (const key of sortedKeys) {
      const layer = layers.get(key)!;
      if (layer.removed) continue;
      snapshot.push({
        index: key,
        resource: layer.resource,
        isSprite: layer.isSprite,
        additive: layer.additive,
        firstFrame: layer.firstFrame,
        timeScale: layer.timeScale,
        preloadFrame: layer.preloadFrame,
        transform: [...layer.transform] as Matrix6,
        color: { ...layer.color },
        spriteFrameNumber: layer.spriteFrameNumber,
        sourceRect: layer.sourceRect ? [...layer.sourceRect] as [number, number, number, number] : null,
      });
    }
    timeline.push(snapshot);

    layers.forEach((layer) => {
      if (!layer.removed) {
        layer.changed = false;
      }
    });
  }

  return timeline;
}

export function buildAllTimelines(animation: Animation): TimelinesMap {
  const timelines: TimelinesMap = {};
  for (let i = 0; i < animation.sprite.length; i++) {
    timelines[i] = buildSpriteTimeline(animation, animation.sprite[i]);
  }
  if (animation.mainSprite) {
    timelines.main = buildSpriteTimeline(animation, animation.mainSprite);
  }
  return timelines;
}

export function computeAnimationBounds(
    animation: Animation,
    textures: Map<string, HTMLImageElement>,
    timelines: TimelinesMap,
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const walk = (spriteIndex: number, parentMatrix: Matrix6): void => {
    const timelineKey: string | number = spriteIndex === -1 ? 'main' : spriteIndex;
    const timeline = timelines[timelineKey];
    if (!timeline) return;
    const sprite = spriteIndex === -1 ? animation.mainSprite! : animation.sprite[spriteIndex];
    if (!sprite) return;

    for (const snapshot of timeline) {
      for (const layer of snapshot) {
        const worldMatrix = multiplyMatrix(parentMatrix, layer.transform);
        if (layer.isSprite) {
          const childIdx = layer.resource === animation.sprite.length ? -1 : layer.resource;
          walk(childIdx, worldMatrix);
        } else {
          const imageDef = animation.image[layer.resource];
          if (!imageDef) continue;
          const tex = textures.get(imageDef.name);
          if (!tex) continue;

          const imgM = transformToMatrix(imageDef.transform);
          const m = multiplyMatrix(worldMatrix, imgM);

          const texW = tex.naturalWidth || tex.width;
          const texH = tex.naturalHeight || tex.height;
          const iw = imageDef.size ? imageDef.size.width : texW;
          const ih = imageDef.size ? imageDef.size.height : texH;

          // 考虑 layer.sourceRect：只用被裁剪出来的那块区域参与边界计算
          let corners: [number, number][];
          if (layer.sourceRect) {
            const [sx, sy, sw, sh] = layer.sourceRect;
            const clippedW = Math.min(sw, texW - sx);
            const clippedH = Math.min(sh, texH - sy);
            if (clippedW > 0 && clippedH > 0) {
              corners = [
                [sx, sy],
                [sx + clippedW, sy],
                [sx + clippedW, sy + clippedH],
                [sx, sy + clippedH],
              ];
            } else {
              corners = [[0, 0], [iw, 0], [iw, ih], [0, ih]];
            }
          } else {
            corners = [[0, 0], [iw, 0], [iw, ih], [0, ih]];
          }

          for (const [cx, cy] of corners) {
            const tx = m[0] * cx + m[2] * cy + m[4];
            const ty = m[1] * cx + m[3] * cy + m[5];
            if (tx < minX) minX = tx;
            if (ty < minY) minY = ty;
            if (tx > maxX) maxX = tx;
            if (ty > maxY) maxY = ty;
          }
        }
      }
    }
  };

  walk(-1, IDENTITY_MATRIX);

  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function getChildSpriteInfo(
    animation: Animation,
    layer: LayerSnapshot,
    actualFrame: number,
): { childSpriteData: Sprite; childSpriteIndex: number; adjustedFrame: number } | null {
  const isMain = layer.resource === animation.sprite.length;
  const childSpriteData = isMain ? animation.mainSprite : animation.sprite[layer.resource];
  if (!childSpriteData || childSpriteData.frame.length === 0) return null;

  const childSpriteIndex = isMain ? -1 : layer.resource;
  const childFrameCount = childSpriteData.frame.length;
  const scaledDelta = Math.floor((actualFrame - layer.firstFrame) * layer.timeScale);
  const adjustedFrame = moduloFrameIndex(scaledDelta + layer.preloadFrame, childFrameCount);
  return { childSpriteData, childSpriteIndex, adjustedFrame };
}
