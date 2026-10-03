/**
 * IslandFactory — create / mount / dispose mapPieces (static PNG or PAM anim).
 *
 * Loaders (PieceLoader) only build DOM + players; this factory owns lifecycle
 * and a single registration into State.players / State.data.pieces.
 */

import type { MapEventNode, PieceInfo } from '../../domain/types';
import { State, pieceRuntimeMap } from '../../core/state';
import { getWorldAnimationBoundary } from '../../core/worldMeta';
import { degreeToRad } from '../../utils/mathTool';
import { computeLocalTransform, loadPiece, preparePiece } from '../../render/PieceLoader';
import { tryGetLayerStack, bindLayerStack, LayerStack } from '../LayerStack';
import type { IslandEntity } from '../entities/types';

function stack(): LayerStack {
  const existing = tryGetLayerStack();
  if (existing) return existing;
  const root = document.getElementById('map-container');
  if (!root) throw new Error('[IslandFactory] #map-container missing');
  const s = new LayerStack(root);
  bindLayerStack(s);
  return s;
}

function unregisterPlayer(player: { destroy(): void } | undefined): void {
  if (!player) return;
  player.destroy();
  const i = State.players.indexOf(player as any);
  if (i !== -1) State.players.splice(i, 1);
}

function toEntity(info: PieceInfo): IslandEntity {
  return {
    kind: 'island',
    node: info.piece,
    element: info.element,
    info,
    player: info.player,
    applyTransform(): void {
      const maxImageId = getWorldAnimationBoundary();
      const runtime = pieceRuntimeMap.get(info.piece);
      if (runtime) {
        runtime.flipScale = info.piece.m_isArtFlipped ? -1 : 1;
        runtime.scaleX = info.piece.m_scaleX ?? 1;
        runtime.scaleY = info.piece.m_scaleY ?? 1;
        if ((info.piece.m_imageID ?? 0) > maxImageId) {
          const STEP = 2647 / 180;
          runtime.angle = degreeToRad(-(STEP * (info.piece.m_rotationAngle ?? 0) % 360));
        } else {
          runtime.angle = degreeToRad(info.piece.m_rotationAngle ?? 0);
        }
      }
      const visualEl = info.element.querySelector('.map-piece-visual') as HTMLDivElement | null;
      const t = computeLocalTransform(info.piece, maxImageId);
      if (visualEl) visualEl.style.transform = t;
      else info.element.style.transform = t;
    },
    dispose(): void {
      unregisterPlayer(info.player);
      info.element.parentNode?.removeChild(info.element);
      pieceRuntimeMap.delete(info.piece);
    },
  };
}

export const IslandFactory = {
  /** Build DOM only — does not mount or register into State lists. */
  async create(node: MapEventNode): Promise<IslandEntity | null> {
    const maxImageId = getWorldAnimationBoundary();
    preparePiece(node);
    const result = loadPiece(node, maxImageId);
    const info = result ? await result : null;
    if (!info) return null;
    // PieceLoader historically pushed player into State.players; strip if present
    // so mount owns a single registration.
    if (info.player) {
      const i = State.players.indexOf(info.player);
      if (i !== -1) State.players.splice(i, 1);
    }
    return toEntity(info);
  },

  /** Create + mount into the correct (parallax, draw) container. */
  async mount(node: MapEventNode): Promise<IslandEntity | null> {
    const entity = await this.create(node);
    if (!entity) return null;

    const layers = stack();
    const pl = node.m_parallaxLayer ?? 0;
    const dl = node.m_drawLayer ?? 0;
    const container = layers.getMapDrawContainer(pl, dl);
    entity.element.style.zIndex = String(layers.nextZ(container));
    container.appendChild(entity.element);

    State.data.pieces.push(entity.info);
    if (entity.player) State.players.push(entity.player);
    return entity;
  },

  /** Remove every island handle bound to this node. */
  unmount(node: MapEventNode): void {
    const keep: PieceInfo[] = [];
    for (const p of State.data.pieces) {
      if (p.piece === node) {
        toEntity(p).dispose();
      } else {
        keep.push(p);
      }
    }
    State.data.pieces = keep;
  },

  applyTransform(node: MapEventNode): void {
    for (const p of State.data.pieces) {
      if (p.piece === node) toEntity(p).applyTransform();
    }
  },
};
