/**
 * Everything about composited "plant seed packet" images: where their layer sprite offsets
 * come from (resource_manifest.json) and the memoized canvas composite itself.
 */
import { LayerDef } from '../../domain/types';
import { State } from '../state';
import { composePlantPacket } from '../../utils/packetComposer';

export const composedPacketCache = new Map<string, Promise<{ url: string; width: number; height: number }>>();

export function getComposedPacketCached(
    cacheKey: string,
    layers: LayerDef[]
): Promise<{ url: string; width: number; height: number }> {
  let promise = composedPacketCache.get(cacheKey);
  if (!promise) {
    promise = composePlantPacket(layers);
    composedPacketCache.set(cacheKey, promise);
  }
  return promise;
}

export function clearComposedPacketCache(): void {
  composedPacketCache.forEach(async (promise) => {
    try {
      const result = await promise;
      URL.revokeObjectURL(result.url);
    } catch (err) {
      console.warn('Revocation of composed seed packet failed:', err);
    }
  });
  composedPacketCache.clear();
}

export async function loadPlantPacketMetadata(): Promise<void> {
  try {
    const manifestFile = State.data.resourceManifestFile;
    if (!manifestFile) {
      console.warn('[PlantPacket] resource_manifest.json not found');
      return;
    }

    const text = await manifestFile.text();
    const x = JSON.parse(text);
    const map = new Map<string, { x: number; y: number }>();

    let candidates: Array<[string, string, string]>;
    if (State.data.isChinaVersion) {
      candidates = [
        ['UIImages', 'UIImages_1536', 'UIImages_768'],
        ['UIImages_Dynamic', 'UIImages_Dynamic_1536', 'UIImages_Dynamic_768'],
      ];
    } else {
      candidates = [
        ['UI_SeedPackets', 'UI_SeedPackets_1536', 'UI_SeedPackets_768'],
        ['UI_AlwaysLoaded', 'UI_AlwaysLoaded_1536', 'UI_AlwaysLoaded_768'],
        ['UIImages', 'UIImages_1536', 'UIImages_768'],
      ];
    }

    const put = (rawPath: string, offset: { x: number; y: number }) => {
      const path = rawPath.replace(/\\/g, '/');
      map.set(path, offset);

      // 相对路径（去掉 images/<res>/）
      const relative = path.replace(/^images\/\d+\//, '');
      if (relative !== path) {
        map.set(relative, offset);
      }

      // 纯文件名
      const baseName = path.substring(path.lastIndexOf('/') + 1);
      if (baseName && !map.has(baseName)) {
        map.set(baseName, offset);
      }
    };

    // One summary line at the end instead of a log per (group, subgroup) hit - this function
    // runs multiple times a session (upload, Start, any mid-session China-version toggle), and
    // candidates has 2-3 groups x 2 resolution-tier subgroups each, so the old per-hit logging
    // could dump 6+ lines every single call.
    const hitGroups: string[] = [];
    for (const [groupId, sg1536, sg768] of candidates) {
      const group = x.group?.find((g: any) => g.identifier === groupId);
      if (!group) {
        continue;
      }

      const subgroup1536 = group.subgroup?.find((sg: any) => sg.identifier === sg1536);
      const subgroup768 = group.subgroup?.find((sg: any) => sg.identifier === sg768);

      if (!subgroup1536 && !subgroup768) {
        continue;
      }

      let groupSpriteCount = 0;
      const extract = (subgroup: any) => {
        if (!subgroup) return;
        const sprites = subgroup.resource?.[0]?.additional?.value?.sprite ?? [];
        groupSpriteCount += sprites.length;
        for (const sprite of sprites) {
          if (!sprite.path) continue;
          put(sprite.path, {
            x: sprite.offset?.[0] ?? 0,
            y: sprite.offset?.[1] ?? 0,
          });
        }
      };

      extract(subgroup1536);
      extract(subgroup768);
      if (groupSpriteCount > 0) {
        hitGroups.push(`${groupId}(${groupSpriteCount})`);
      }
    }

    State.data.plantPacketMeta = map;

    if (map.size > 0) {
      console.log(`[PlantPacket] Loaded ${map.size} sprite keys from: ${hitGroups.join(', ')}`);
    } else {
      console.warn('[PlantPacket] No packet sprites found in any manifest group');
    }
  } catch (e) {
    console.error('[PlantPacket] Failed to load manifest:', e);
  }
}