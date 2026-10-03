/**
 * Coordinate model for PvZ2 worldmaps.
 *
 * Data space  — MapEventNode.m_position (authoring units vs 600-wide reference).
 * World space — pixels inside #map-container before camera: data * (textureRes / 600).
 * Screen space — after camera matrix on #map-container.
 *
 * Parallax runtime formula (EditorApp tick):
 *   scrollDx = screenToWorld(0,0).x - boxLeft
 *   root.style.transform = translateX((layer/10) * scrollDx)
 */

import { State } from '../core/state';
import { CoordinateSystem } from '../core/camera';

export const DATA_REF = 600;

export function dataToWorld(dataX: number, dataY: number, resolution = State.data.textureResolution): { x: number; y: number } {
  const s = resolution / DATA_REF;
  return { x: dataX * s, y: dataY * s };
}

export function worldToData(worldX: number, worldY: number, resolution = State.data.textureResolution): { x: number; y: number } {
  const s = DATA_REF / resolution;
  return { x: worldX * s, y: worldY * s };
}

export function parallaxScrollDx(): number {
  const vpWorldLeft = CoordinateSystem.screenToWorld(0, 0).x;
  return vpWorldLeft - State.data.boxLeft;
}

export function parallaxOffsetX(layer: number, scrollDx = parallaxScrollDx()): number {
  return (layer / 10) * scrollDx;
}

/** Screen → data on a given parallax layer (invert the root's translateX). */
export function screenToDataOnLayer(sx: number, sy: number, parallaxLayer: number): { x: number; y: number } {
  const world = CoordinateSystem.screenToWorld(sx, sy);
  const offset = parallaxOffsetX(parallaxLayer);
  return worldToData(world.x - offset, world.y);
}
