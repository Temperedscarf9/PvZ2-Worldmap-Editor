import { EventResourceDef } from '../../domain/types';
import { EventResourceCtx } from '../shared';

// path_node has no visual resources of its own - PathRenderer draws the connecting path/tiles.
export async function resolvePathNodeResources(_ctx: EventResourceCtx): Promise<EventResourceDef[]> {
  return [];
}
