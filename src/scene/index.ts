/**
 * Scene module — structural model of the PvZ2 worldmap.
 *
 *   coords     data ↔ world ↔ screen + parallax invert
 *   layers     covering / parallax / draw constants
 *   LayerStack sparse DOM factory for the layer tree
 *   SceneGraph lifecycle + mount helpers
 *   factories  Island / Event / Path entity create-mount-dispose
 */

export * from './coords';
export * from './layers';
export { LayerStack, getLayerStack, tryGetLayerStack, bindLayerStack } from './LayerStack';
export { SceneGraph, isSceneReady } from './SceneGraph';
export { IslandFactory, EventFactory, PathFactory } from './factories';
export type { LayerHost } from './LayerStack';
export type { PathHandle } from './SceneGraph';
export type { IslandEntity, EventEntity, PathEntity, MapEntity } from './entities/types';
