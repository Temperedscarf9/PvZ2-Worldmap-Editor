import { EventResourceDef, WorldMapEventStatus } from '../../domain/types';
import { State } from '../../core/state';
import { findAnimInGlobal } from '../../core/resources';
import { GIFTBOX_OFFSET } from '../../utils/constants';
import { animScale1200 } from '../../utils/scale';
import { EventResourceCtx } from '../shared';

export async function resolveGiftboxResources(ctx: EventResourceCtx): Promise<EventResourceDef[]> {
    // China build has no giftbox assets at all.
    if (State.data.isChinaVersion) return [];

    const { resolution, status } = ctx;
    const anim = findAnimInGlobal(`images/${resolution}/initial/worldmap/giftbox_world_map/`);
    return anim
        ? [
            {
                type: 'animation',
                animData: anim,
                options: { label: status === WorldMapEventStatus.cleared ? 'open_idle' : 'idle' },
                offset: GIFTBOX_OFFSET,
                scale: animScale1200(resolution),
            },
        ]
        : [];
}