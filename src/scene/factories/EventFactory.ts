/**
 * EventFactory — create / mount / dispose event nodes (including doodad + zomboss stage).
 * One logical node may produce multiple EventPieceInfo (stage + top).
 */

import type { MapEventNode, EventPieceInfo, EventResourceDef } from '../../domain/types';
import { State } from '../../core/state';
import {
  loadEventPiecesForNode,
  computeEventLocalTransform,
  loadResourcesToElement,
  attachStarsToElement,
} from '../../render/EventLoader';
import type { PamCanvasPlayer } from '../../pam/canvas-player';
import { tryGetLayerStack, bindLayerStack, LayerStack } from '../LayerStack';
import type { EventEntity } from '../entities/types';

function stack(): LayerStack {
  const existing = tryGetLayerStack();
  if (existing) return existing;
  const root = document.getElementById('map-container');
  if (!root) throw new Error('[EventFactory] #map-container missing');
  const s = new LayerStack(root);
  bindLayerStack(s);
  return s;
}

function unregisterPlayers(players: { destroy(): void }[] | undefined): void {
  if (!players) return;
  for (const pl of players) {
    pl.destroy();
    const i = State.players.indexOf(pl as any);
    if (i !== -1) State.players.splice(i, 1);
  }
}

function toEntity(info: EventPieceInfo): EventEntity {
  return {
    kind: 'event',
    node: info.node,
    element: info.element,
    info,
    isZombossStage: !!info.isZombossStage,
    players: info.players || [],
    dispose(): void {
      unregisterPlayers(info.players);
      info.element.parentNode?.removeChild(info.element);
    },
  };
}

export const EventFactory = {
  /** Build DOM only — strips any loader-side State.players registration. */
  async create(node: MapEventNode): Promise<EventEntity[]> {
    const pieces = await loadEventPiecesForNode(node);
    if (!pieces?.length) return [];

    const entities: EventEntity[] = [];
    for (const info of pieces) {
      if (info.players) {
        for (const pl of info.players) {
          const i = State.players.indexOf(pl);
          if (i !== -1) State.players.splice(i, 1);
        }
      }
      entities.push(toEntity(info));
    }
    return entities;
  },

  /** Create + mount each piece into zomboss or event draw-layer. */
  async mount(node: MapEventNode): Promise<EventEntity[]> {
    const entities = await this.create(node);
    if (!entities.length) return [];

    const layers = stack();
    const pl = node.m_parallaxLayer ?? 0;
    const dl = node.m_drawLayer ?? 0;

    for (const entity of entities) {
      let container: HTMLElement;
      if (entity.isZombossStage) {
        layers.ensureHost(0);
        container = layers.zomboss!;
      } else {
        container = layers.getEventDrawContainer(pl, dl);
      }
      entity.element.style.zIndex = String(layers.nextZ(container));
      container.appendChild(entity.element);
      State.data.eventPieces.push(entity.info);
      for (const plr of entity.players) State.players.push(plr);
    }
    return entities;
  },

  unmount(node: MapEventNode): void {
    const keep: EventPieceInfo[] = [];
    for (const ep of State.data.eventPieces) {
      if (ep.node === node) toEntity(ep).dispose();
      else keep.push(ep);
    }
    State.data.eventPieces = keep;
  },

  applyTransform(node: MapEventNode): void {
    for (const ep of State.data.eventPieces) {
      if (ep.node === node) {
        ep.element.style.transform = computeEventLocalTransform(node, 0, 0, 1);
      }
    }
  },

  /** Prefer non-stage piece for selection after remount. */
  pickSelectable(entities: EventEntity[]): EventPieceInfo | null {
    const top = entities.find((e) => !e.isZombossStage);
    return (top || entities[0])?.info ?? null;
  },

  /**
   * True when existing resources can keep the same players (only labels need updating).
   * Used by eventOnly incremental renders to avoid full DOM rebuild.
   */
  resourcesCompatible(prev: EventResourceDef[] | undefined, next: EventResourceDef[]): boolean {
    if (!prev || prev.length === 0 || prev.length !== next.length) return false;
    for (let i = 0; i < next.length; i++) {
      const oldR = prev[i];
      const newR = next[i];
      if (oldR.type !== newR.type) return false;
      if (oldR.type === 'animation' && oldR.animData?.path !== newR.animData?.path) return false;
      if (oldR.type === 'image' && oldR.file !== newR.file) return false;
      if (oldR.type === 'composited-image' && oldR.url !== newR.url) return false;
    }
    return true;
  },

  /** Update animation labels on an existing piece without rebuilding DOM. */
  applyLabelsInPlace(existing: EventPieceInfo, resources: EventResourceDef[]): void {
    let playerIdx = 0;
    for (const newR of resources) {
      if (newR.type === 'animation' && existing.players) {
        const player = existing.players[playerIdx++];
        if (!player) continue;
        const opts: any = newR.options || {};
        if (opts.probabilityBucket) {
          player.setLabelProbabilityBucket(opts.probabilityBucket, opts.probabilitySide);
        } else {
          player.setLabelProbabilityBucket(null);
          player.playLabel(opts.label || 'idle');
        }
      }
    }
    existing.resources = resources;
  },

  /**
   * Incompatible resources: clear inner HTML, reload into the same element shell.
   * Returns false if interrupted.
   */
  async rebuildContentsInPlace(
    existing: EventPieceInfo,
    node: MapEventNode,
    resources: EventResourceDef[],
    opts: { allowStars?: boolean; isInterrupted?: () => boolean } = {}
  ): Promise<boolean> {
    unregisterPlayers(existing.players);
    existing.element.innerHTML = '';
    existing.players = [];

    const visualWrapper = document.createElement('div');
    visualWrapper.className = 'event-visual-wrapper';
    const half = (State.data.textureResolution / 1536) * 50;
    visualWrapper.style.cssText = `
      position: absolute;
      left: ${half}px;
      top: ${half}px;
      width: 0px;
      height: 0px;
    `;
    existing.element.appendChild(visualWrapper);

    const players: PamCanvasPlayer[] = [];
    const success = await loadResourcesToElement(
      resources,
      visualWrapper,
      node,
      players,
      opts.isInterrupted
    );
    if (!success) return false;

    existing.players = players;
    existing.resources = resources;
    for (const p of players) State.players.push(p);

    if (opts.allowStars) {
      await attachStarsToElement(visualWrapper, node);
    }
    return true;
  },
};
