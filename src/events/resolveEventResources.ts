import { EventResourceDef, MapEventNode, MapEventType, WorldMapEventStatus } from '../domain/types';
import { eventNodeRuntimeMap, State } from '../core/state';
import { EventResourceCtx, stringToMapEventType } from './shared';
import { resolveLevelResources } from './resolvers/level';
import { resolvePlantResources } from './resolvers/plant';
import { resolveUpgradeResources } from './resolvers/upgrade';
import { resolveStarGateResources } from './resolvers/starGate';
import { resolveKeyGateResources } from './resolvers/keyGate';
import { resolveGiftboxResources } from './resolvers/giftbox';
import { resolvePinataResources } from './resolvers/pinata';
import { resolveDoodadResources } from './resolvers/doodad';
import { resolvePathNodeResources } from './resolvers/pathNode';

export const EVENT_RESOURCE_RESOLVERS: Partial<
    Record<MapEventType, (ctx: EventResourceCtx) => Promise<EventResourceDef[]>>
> = {
  [MapEventType.level]: resolveLevelResources,
  [MapEventType.plant]: resolvePlantResources,
  [MapEventType.plantbox]: resolvePlantResources,
  [MapEventType.upgrade]: resolveUpgradeResources,
  [MapEventType.star_gate]: resolveStarGateResources,
  [MapEventType.key_gate]: resolveKeyGateResources,
  [MapEventType.giftbox]: resolveGiftboxResources,
  [MapEventType.pinata]: resolvePinataResources,
  [MapEventType.doodad]: resolveDoodadResources,
  [MapEventType.path_node]: resolvePathNodeResources,
};

const eventResourceCache = new Map<string, Promise<EventResourceDef[]>>();

export function clearEventResourceCache(): void {
  eventResourceCache.clear();
}

/** Drop only cache entries for one eventId (avoids full-table clear on single-node edits). */
export function invalidateEventResourceCacheForNode(eventId: number | string): void {
  const prefix = String(eventId) + '_';
  for (const key of Array.from(eventResourceCache.keys())) {
    if (key.startsWith(prefix)) {
      eventResourceCache.delete(key);
    }
  }
}

export async function resolveEventResources(node: MapEventNode, worldName: string): Promise<EventResourceDef[]> {
  const eventType = stringToMapEventType(node.m_eventType);
  const runtime = eventNodeRuntimeMap.get(node);
  const status = runtime?.wmed.S ?? WorldMapEventStatus.locked;
  const resolution = State.data.textureResolution;
  const isLinear = State.data.isLinear;
  const isArtFlipped = node.m_isArtFlipped;
  // Scheme 2: renderZombossNode is recomputed each renderMap for boss nodes and read by
  // level.ts to gate the stage animation — must be part of the cache key.
  // Scheme 1 (nonfinalboss) ignores this flag; m_levelNodeType already separates the two.
  // Hologram: only the lowest unlocked|cleared boss|nonfinalboss on the parent chain
  // gets renderHologramNode=true; higher nodes flip false when a descendant is cleared.
  // Must be in the key or a later toggle reuses the earlier "true" resource list.
  const renderZomboss = runtime?.renderZombossNode;
  const renderHologram = runtime?.renderHologramNode;
  // key_gate flag offset / flipX depends on parent X relative to this node.
  // Must be part of the key or a move of either node reuses stale flag layout.
  let keyGateGeom = '';
  if (node.m_eventType === 'key_gate') {
    const parentName = String(node.m_parentEvent ?? '');
    const eventList = State.data.mapConfig?.objdata?.m_eventList || [];
    const parent = parentName
      ? eventList.find((n) => String(n.m_name) === parentName)
      : undefined;
    const parentX = Math.round(parent?.m_position?.x ?? 0);
    const nodeX = Math.round(node.m_position?.x ?? 0);
    const side = parentX - nodeX < 1 ? 'L' : 'R';
    keyGateGeom = `kg_${parentName}_${parentX}_${nodeX}_${side}`;
  }

  const cacheKey = [
    node.m_eventId,
    node.m_eventType ?? '',
    node.m_dataString ?? '',
    node.m_cost ?? '',
    node.m_displayText ?? '',
    node.m_levelNodeType ?? '',
    worldName,
    resolution,
    status,
    isArtFlipped ? 't' : 'f',
    isLinear ? 't' : 'f',
    renderZomboss === false ? 'nz' : 'z',
    renderHologram === true ? 'h' : 'nh',
    keyGateGeom,
  ].join('_');

  let cached = eventResourceCache.get(cacheKey);
  if (!cached) {
    const ctx: EventResourceCtx = {
      node,
      worldName,
      resolution,
      status,
      worldId: State.data.mapConfig?.objdata?.m_worldId || 1,
      isArtFlipped,
    };
    const resolver = EVENT_RESOURCE_RESOLVERS[eventType];
    if (!resolver) return Promise.resolve([]);
    cached = resolver(ctx);
    eventResourceCache.set(cacheKey, cached);
  }
  return cached;
}

export { stringToMapEventType, getAnimationProbabilityBucket } from './shared';
export type { EventResourceCtx } from './shared';