/**
 * Loads a single map-piece (island) node into a mounted PieceInfo: either a static PNG or,
 * once its m_imageID crosses the world's animation boundary, a PamCanvasPlayer-driven anim.
 */
import { PamCanvasPlayer } from '../pam/canvas-player';
import { Matrix, degreeToRad } from '../utils/mathTool';
import { CONFIG } from '../utils/constants';
import { MapEventNode, PieceInfo } from '../domain/types';
import { State, pieceRuntimeMap, imageDimensionsCache, PieceRuntime } from '../core/state';
import { getWorldAnimationBoundary, fetchWorldMapListAnimationDelays, fetchWorldMapListAnimationDetails } from '../core/worldMeta';
import { getObjectUrlCached, compileAnimAssets, findPieceAnim } from '../core/resources';
import { getAnimTransformFix } from '../core/animTransformFix';
import { hitboxSize, hitboxHalf } from '../utils/scale';





export function preparePiece(piece: MapEventNode): void {
  const pos = piece.m_position || { x: 0, y: 0 };
  const runtime: PieceRuntime = {
    worldX: (pos.x * State.data.textureResolution) / 600,
    worldY: (pos.y * State.data.textureResolution) / 600,
    flipScale: piece.m_isArtFlipped ? -1 : 1,
    scaleX: piece.m_scaleX ?? 1,
    scaleY: piece.m_scaleY ?? 1,
    width: 0,
    height: 0,
    angle: 0,
  };
  pieceRuntimeMap.set(piece, runtime);
}

export function computeLocalTransform(piece: MapEventNode, maxImageId: number): string {
  let m = Matrix.identity;
  const worldId: number = State.data.mapConfig?.objdata?.m_worldId || 1;
  const isAnimation = (piece.m_imageID ?? 0) > maxImageId;
  const runtime = pieceRuntimeMap.get(piece);
  if (!runtime) return 'matrix(1,0,0,1,0,0)';

  if (!isAnimation) {
    m = Matrix.multiply(m, Matrix.scale(runtime.scaleX, runtime.scaleY));
    m = Matrix.multiply(m, Matrix.translate(0, runtime.height / 2));
    m = Matrix.multiply(m, Matrix.rotate(runtime.angle));
    m = Matrix.multiply(m, Matrix.scale(runtime.flipScale, 1));
    m = Matrix.multiply(m, Matrix.translate(-runtime.width / 2, -runtime.height / 2));
  } else {
    const fix = getAnimTransformFix(worldId, runtime.animId || 0);
    const sx = (runtime.scaleX * fix.s * State.data.textureResolution) / 1536;
    const sy = (runtime.scaleY * fix.s * State.data.textureResolution) / 1536;
    m = Matrix.multiply(m, Matrix.scale(sx, sy));
    m = Matrix.multiply(m, Matrix.scale(runtime.flipScale, 1));
    m = Matrix.multiply(m, Matrix.rotate(runtime.angle));
    m = Matrix.multiply(m, Matrix.translate(-97 * fix.k * 2, -97 * fix.k * 2));
  }
  return `matrix(${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}, ${m[4]}, ${m[5]})`;
}

/** Builds the two-level (hitbox wrapper + visual) DOM used by every static island piece. */
function buildStaticPieceElement(runtime: PieceRuntime, url: string, transform: string): HTMLDivElement {
  const res = State.data.textureResolution;
  const hb = hitboxSize(res);
  const half = hitboxHalf(res);
  const el = document.createElement('div');
  el.className = 'map-piece map-type-island';
  el.style.cssText = `
    width:${hb}px;height:${hb}px;
    left:${runtime.worldX - half}px;top:${runtime.worldY - half}px;
  `;
  const visualEl = document.createElement('div');
  visualEl.className = 'map-piece-visual';
  visualEl.style.cssText = `
    position:absolute;
    left:${half}px;top:${half}px;
    width:${runtime.width}px;height:${runtime.height}px;
    background-image:url(${url});
    transform:${transform};
    transform-origin:0 0;
    pointer-events:none;
    background-size:100% 100%;
    background-repeat:no-repeat;
  `;
  el.appendChild(visualEl);
  return el;
}

export function loadStaticImage(piece: MapEventNode, file: File): Promise<PieceInfo | null> {
  const cached = imageDimensionsCache.get(file);
  const maxImageId = getWorldAnimationBoundary();
  const url = getObjectUrlCached(file);

  // Shared by both the cache-hit (sync) and cold-load (async) paths below so the DOM is only
  // ever built in one place, once dimensions + runtime state are known.
  const finish = (width: number, height: number): PieceInfo | null => {
    const runtime = pieceRuntimeMap.get(piece);
    if (!runtime) return null;
    runtime.width = width;
    runtime.height = height;
    runtime.angle = degreeToRad(piece.m_rotationAngle ?? 0);
    const element = buildStaticPieceElement(runtime, url, computeLocalTransform(piece, maxImageId));
    return { piece, element };
  };

  if (cached) {
    return Promise.resolve(finish(cached.width, cached.height));
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageDimensionsCache.set(file, { width: img.width, height: img.height });
      resolve(finish(img.width, img.height));
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = url;
  });
}

export async function loadAnimationPiece(
    piece: MapEventNode,
    animData: any,
    maxImageId: number
): Promise<PieceInfo | null> {
  try {
    const assets = await compileAnimAssets(animData);
    if (!assets) return null;

    const { animation, textureMap } = assets;
    const sizeW = animation.size[0] || 390;
    const sizeH = animation.size[1] || 390;

    const runtime = pieceRuntimeMap.get(piece);
    if (!runtime) return null;
    runtime.height = sizeH;
    runtime.width = sizeW;
    const STEP = 2647 / 180;
    const angle = -(STEP * (piece.m_rotationAngle ?? 0) % 360);
    runtime.angle = degreeToRad(angle);

    runtime.animId = (piece.m_imageID ?? 0) - maxImageId;

    const res = State.data.textureResolution;
    const hb = hitboxSize(res);
    const half = hitboxHalf(res);
    const el = document.createElement('div');
    el.className = 'map-piece map-type-island';
    el.style.cssText = `
      width:${hb}px;
      height:${hb}px;
      left:${runtime.worldX - half}px;
      top:${runtime.worldY - half}px;
    `;

    const visualEl = document.createElement('div');
    visualEl.className = 'map-piece-visual';
    visualEl.style.cssText = `
      position:absolute;
      left:${half}px;
      top:${half}px;
      width:${sizeW}px;
      height:${sizeH}px;
      transform:${computeLocalTransform(piece, maxImageId)};
      transform-origin:0 0;
      pointer-events:none;
    `;

    const canvas = document.createElement('canvas');
    canvas.width = sizeW;
    canvas.height = sizeH;
    visualEl.appendChild(canvas);
    el.appendChild(visualEl);

    const player = new PamCanvasPlayer(canvas, animation, textureMap, animData?.path);

    const animId = (piece.m_imageID ?? 0) - maxImageId;
    const worldName = State.data.selectedWorld;
    if (worldName) {
      if (State.data.isLinear) {
        const detailsMap = await fetchWorldMapListAnimationDetails();
        const worldDetails = detailsMap.get(worldName.toLowerCase());
        if (worldDetails) {
          const detail = worldDetails.find(d => d.animId === animId);
          if (detail) {
            player.setDelayDetails(detail.min, detail.max);
          }
        }
      } else {
        const delaysMap = await fetchWorldMapListAnimationDelays();
        const worldDelays = delaysMap.get(worldName.toLowerCase());
        if (worldDelays && worldDelays[animId - 1]) {
          const delay = worldDelays[animId - 1];
          player.setDelayDetails(delay.min, delay.max);
        }
      }
    }

    // Player registration is owned by IslandFactory / mount path — not here.
    return { piece, element: el, player };
  } catch (e) {
    console.error('[WorldMap Animation Load Error]', e);
    return null;
  }
}

export function loadPiece(piece: MapEventNode, maxImageId: number): Promise<PieceInfo | null> | null {
  if (!pieceRuntimeMap.has(piece)) {
    preparePiece(piece);
  }
  const worldName = State.data.selectedWorld;
  if (!worldName || !State.data.worlds[worldName]) return null;

  const assets = State.data.worlds[worldName];
  const imageId = piece.m_imageID ?? 0;
  const isAnimation = imageId > maxImageId;

  if (!isAnimation) {
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
    const fileName = `${CONFIG.filePrefix}${imageId + offset}${CONFIG.fileExt}`;
    const file = assets.images[fileName];
    if (!file) return null;
    return loadStaticImage(piece, file);
  }

  const animIndex = imageId - maxImageId;
  const anim = findPieceAnim(worldName, animIndex);
  if (!anim || !anim.json || !anim.files.length) return null;
  return loadAnimationPiece(piece, anim, maxImageId);
}
