/**
 * Shared context type, event-type lookup, animation probability-bucket table, and canvas
 * text-to-image helpers used by two or more of the per-event-type resolvers in ./resolvers/.
 */
import { MapEventNode, MapEventType, WorldMapEventStatus } from '../domain/types';
import { loadCustomFontIfNeeded } from '../core/resources';

export interface EventResourceCtx {
  node: MapEventNode;
  worldName: string;
  resolution: number;
  status: WorldMapEventStatus;
  worldId: number;
  isArtFlipped?: boolean;
}

export let AnimationProbabilityBuckets: Record<string, Record<string, number>> = {
  stargate: { "locked_%s": 90, "_alt": 5, "_alt2": 5 },
  bonkchoy: { "idle": 10, "idle2": 5, "idle3": 20 },
  chilibean: { "idle": 50, "idle2": 49, "idle3": 1 },
  coconutcannon: { "idle": 10, "idle2": 5, "idle3": 1 },
  empeach: { "idle": 10, "idle2": 2 },
  magnifying_grass: { "idle": 15, "idle2": 3, "idle3": 5 },
  snapdragon: { "idle": 20, "idle2": 10, "idle3": 2 },
  springbean: { "idle": 10, "idle2": 5 },
  gravebuster: { "attack1": 1 },
  chardguard: {"idle_leaves3": 20, "idle2_leaves3": 10, "idle3_leaves3": 5},
  citron: { "idle2": 1 },
  puffshroom: { "idle_stage1": 80, "idle2_stage1": 20 },
  sunshroom: { "idle_stage3": 1},// sunshroom: { "idle_stage3": ?, "idle2_stage3": ? },
  redstinger: {"idle1_1": 20, "idle1_2": 10},
  lilypad: {"idle": 600, "idle2": 30, "idle3": 10, "idle4": 30, "idle5": 20},
  streetlamp:{ "idle01": 10, "idle02": 2 },
};

/** Debug mirror on window (optional). Runtime reads always prefer the module map. */
if (typeof window !== 'undefined') {
  (window as any).AnimationProbabilityBuckets = AnimationProbabilityBuckets;
}

export function getAnimationProbabilityBucket(key: string): Record<string, number> | undefined {
  const override =
    typeof window !== 'undefined'
      ? (window as any).AnimationProbabilityBuckets
      : null;
  const buckets = override && typeof override === 'object' ? override : AnimationProbabilityBuckets;
  return buckets[key];
}

export const EVENT_TYPE_LOOKUP: Record<string, MapEventType> = Object.freeze(
    Object.fromEntries(
        Object.entries(MapEventType)
            .filter(([, v]) => typeof v === 'number')
            .map(([k, v]) => [k, v as MapEventType])
    )
);

export const stringToMapEventType = (s: string): MapEventType => {
  if (s === 'bonus') return MapEventType.upgrade;
  return EVENT_TYPE_LOOKUP[s] ?? MapEventType.none;
};

export async function createGeneralGlyphUrl(
    text: string,
    fontSize: number,
    fillStyle: string,
    strokeStyle: string
): Promise<{ url: string; w: number; h: number }> {
  await loadCustomFontIfNeeded();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { url: '', w: 0, h: 0 };
  }

  ctx.font = `${fontSize}px fbUsv8C5eI, Arial, sans-serif`;
  const metrics = ctx.measureText(text);

  const textWidth = Math.ceil(
      metrics.actualBoundingBoxLeft !== undefined && metrics.actualBoundingBoxRight !== undefined
          ? metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
          : metrics.width
  );

  const textHeight = Math.ceil(
      metrics.actualBoundingBoxAscent !== undefined && metrics.actualBoundingBoxDescent !== undefined
          ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
          : fontSize
  );

  const shadowOffsetX = 3;
  const shadowOffsetY = 5;
  const w = textWidth || 1;
  const h = textHeight || 1;

  // 固定的极细轮廓宽度
  const strokeWidth = 4;
  const pad = Math.ceil(strokeWidth) + 2;
  canvas.width  = w + pad * 2 + Math.abs(shadowOffsetX);
  canvas.height = h + pad * 2 + Math.abs(shadowOffsetY);

  ctx.font = `${fontSize}px fbUsv8C5eI, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // 1. 右下伪影
  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  ctx.fillText(text, canvas.width / 2 + shadowOffsetX, canvas.height / 2 + shadowOffsetY);

  // 2. 极细黑色轮廓
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

  // 3. 白色填充
  ctx.fillStyle = fillStyle;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  return {
    url: canvas.toDataURL(),
    w: canvas.width,
    h: canvas.height,
  };
}

export async function createKeyGateTextDataUrl(
    text: string,
    fontSize: number,
    fillStyle: string,
    strokeStyle: string,
    strokeWidth: number
): Promise<{ url: string; w: number; h: number; pad: number }> {
  await loadCustomFontIfNeeded();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { url: '', w: 0, h: 0, pad: 0 };
  }

  ctx.font = `${fontSize}px fbUsv8C5eI, Arial, sans-serif`;
  const metrics = ctx.measureText(text);

  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil(fontSize * 1.2);

  const pad = Math.ceil(strokeWidth) + 1;
  canvas.width = textWidth + pad * 2;
  canvas.height = textHeight + pad * 2;

  ctx.font = `${fontSize}px fbUsv8C5eI, Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  if (strokeWidth > 0) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, pad, pad);
  }

  ctx.fillStyle = fillStyle;
  ctx.fillText(text, pad, pad);

  return {
    url: canvas.toDataURL(),
    w: canvas.width,
    h: canvas.height,
    pad
  };
}
