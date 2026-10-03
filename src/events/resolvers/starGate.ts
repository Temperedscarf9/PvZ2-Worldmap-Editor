import { EventResourceDef, WorldMapEventStatus } from '../../domain/types';
import { State } from '../../core/state';
import { findAnimInGlobal } from '../../core/resources';
import { STAR_GATE_OFFSET } from '../../utils/constants';
import { animScale1200 } from '../../utils/scale';
import { EventResourceCtx, getAnimationProbabilityBucket } from '../shared';

export async function resolveStarGateResources(ctx: EventResourceCtx): Promise<EventResourceDef[]> {
  const { node, resolution, status } = ctx;
  const isChina = State.data.isChinaVersion;

  // China build has no "inactive" stargate animation - locked status uses the same randomized
  // "locked" label pool that international only applies to unlocked status.
  const usesLockedLabelPool =
      status === WorldMapEventStatus.unlocked || (isChina && status === WorldMapEventStatus.locked);

  const prefix = usesLockedLabelPool
      ? 'locked'
      : status === WorldMapEventStatus.locked
          ? 'inactive' // international only - unreachable for China, see usesLockedLabelPool above
          : 'open';
  const suffix = node.m_isArtFlipped ? '_left' : '_right';
  const label = prefix + suffix;
  const anim = findAnimInGlobal(
      `images/${resolution}/${isChina ? 'UICommon' : 'initial'}/worldmap/stargate/`
  );

  const stargateOptions: any = { label };
  if (!State.data.isLinear && usesLockedLabelPool) {
    const bucket = getAnimationProbabilityBucket('stargate');
    if (bucket) {
      const side = node.m_isArtFlipped ? 'left' : 'right';
      const resolvedBucket: Record<string, number> = {};
      for (const [key, val] of Object.entries(bucket)) {
        let realKey = key;
        if (key.includes('%s')) {
          realKey = key.replace('%s', side);
        } else if (key.startsWith('_')) {
          realKey = 'locked_' + side + key;
        }
        resolvedBucket[realKey] = val;
      }
      stargateOptions.probabilityBucket = resolvedBucket;
    }
  }

  return anim
      ? [
        {
          type: 'animation',
          animData: anim,
          options: stargateOptions,
          offset: STAR_GATE_OFFSET,
          scale: animScale1200(resolution),
        },
      ]
      : [];
}