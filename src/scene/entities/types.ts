/**
 * Map entity handles — lightweight wrappers around loaded DOM + runtime data.
 * Factories create these; SceneGraph / LayerStack mount them.
 */

import type { MapEventNode, PieceInfo, EventPieceInfo } from '../../domain/types';
import type { PamCanvasPlayer } from '../../pam/canvas-player';

export type EntityKind = 'island' | 'event' | 'path';

export interface MapEntity {
  readonly kind: EntityKind;
  readonly node: MapEventNode;
  readonly element: HTMLDivElement;
  dispose(): void;
}

export interface IslandEntity extends MapEntity {
  readonly kind: 'island';
  readonly info: PieceInfo;
  readonly player?: PamCanvasPlayer;
  applyTransform(): void;
}

export interface EventEntity extends MapEntity {
  readonly kind: 'event';
  readonly info: EventPieceInfo;
  readonly isZombossStage: boolean;
  readonly players: PamCanvasPlayer[];
}

export interface PathEntity {
  readonly kind: 'path';
  readonly element: HTMLDivElement;
  readonly player?: PamCanvasPlayer;
  dispose(): void;
}
