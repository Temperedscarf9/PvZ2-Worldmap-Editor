/**
 * PlantTypes.json registry + plant packet / animation preload cache.
 *
 * - Load once from convert/packages/PlantTypes.json after the asset pack is indexed.
 * - On Start: pre-compose every plant seed-packet and warm every plant animation.
 * - Map clear / world switch only tears down DOM entities; these caches stay alive until
 *   the whole resource pack is unloaded (or resolution / China-flag forces a rebuild).
 *
 * TypeName  ↔ worldmap plant / plantbox m_dataString
 * aliases[0] ↔ stable plant identifier
 * HomeWorld  ↔ packet base frame (via getPacketName) + event-property plant picker filter
 * Premium    ↔ objdata.Premium; when true use ready_premium.png as packet base
 */
import { LayerDef } from '../../domain/types';
import { State } from '../state';
import { findAnimInGlobal, findFileInGlobal } from './find';
import { getComposedPacketCached, clearComposedPacketCache } from './packet';
import { compileAnimAssets } from './index';
import {
    CONFIG,
    getPacketName,
    getPlantResourceName,
    INITIAL_PLANTS,
    PLANT_OFFSET,
} from '../../utils/constants';
import { PLANT_NAME_MAP, PACKET_PLANT_MAP, COMMON_PACKETS, CHINA_PLANT1_LIST } from '../../utils/plantMetadata';
import { animScale1536 } from '../../utils/scale';

export interface PlantTypeDef {
    /** aliases[0] — primary identifier */
    alias: string;
    /** TypeName — matches m_dataString on plant / plantbox nodes */
    typeName: string;
    /** HomeWorld logical name (tutorial, egypt, …); empty if unset */
    homeWorld: string;
    integerId: number;
    popAnim: string;
    rarity: string;
    premium: boolean;
}

/** All PlantType entries discovered from PlantTypes.json (stable order). */
export let plantTypesList: PlantTypeDef[] = [];

export const plantTypeByTypeName = new Map<string, PlantTypeDef>();
export const plantTypeByAlias = new Map<string, PlantTypeDef>();

/** Resolved packet blob keyed by `${typeName}|${worldName}|${resolution}|${cn|ww}`. */
export const plantPacketPreloadCache = new Map<
    string,
    Promise<{ url: string; width: number; height: number } | null>
>();

/** Tracks which anim paths have been warmed so we don't re-kick compileAnimAssets needlessly. */
const warmedPlantAnimPaths = new Set<string>();

/**
 * ArtCenter from convert/packages/PlantProperties.json.
 * Plant pop animation offset = -2 * ArtCenter. Sprout / packet keep PLANT_OFFSET.
 */
export const plantArtCenterByKey = new Map<string, { x: number; y: number }>();

let plantTypesLoaded = false;

export function clearPlantTypeRegistry(): void {
    plantTypesList = [];
    plantTypeByTypeName.clear();
    plantTypeByAlias.clear();
    plantArtCenterByKey.clear();
    plantTypesLoaded = false;
    plantDropdownOptionsByName = null;
    plantDropdownDefaultOrder = null;
    plantDropdownOrderByWorld = null;
    plantDropdownHomeSetByWorld = null;
}

function registerArtCenterKeys(keys: string[], art: { x: number; y: number }): void {
    for (const raw of keys) {
        if (!raw) continue;
        plantArtCenterByKey.set(raw, art);
        const lower = raw.toLowerCase();
        if (lower !== raw) plantArtCenterByKey.set(lower, art);
        if (/Default$/i.test(raw)) {
            const stem = raw.replace(/Default$/i, '');
            if (stem) {
                plantArtCenterByKey.set(stem, art);
                plantArtCenterByKey.set(stem.toLowerCase(), art);
            }
        }
    }
}

function findPackageJsonFile(fileName: string): File | null {
    if (!State.data.indexedFiles && !State.data.globalFiles) return null;
    const needle = `packages/${fileName}`;
    if (State.data.indexedFiles) {
        for (const [key, f] of State.data.indexedFiles.entries()) {
            const p = key.replace(/\\/g, '/');
            if (
                p === `convert/packages/${fileName}` ||
                p.endsWith(`/${needle}`) ||
                p.endsWith(needle)
            ) {
                return f;
            }
        }
    }
    if (State.data.globalFiles) {
        for (const key of Object.keys(State.data.globalFiles)) {
            const p = key.replace(/\\/g, '/');
            if (p.endsWith(`/${needle}`) || p.endsWith(needle) || p.endsWith(`/${fileName}`)) {
                return State.data.globalFiles[key];
            }
        }
    }
    return null;
}

/** Load ArtCenter map from convert/packages/PlantProperties.json. */
export async function loadPlantProperties(): Promise<void> {
    plantArtCenterByKey.clear();
    const file = findPackageJsonFile('PlantProperties.json');
    if (!file) {
        console.warn(
            '[PlantProperties] convert/packages/PlantProperties.json not found; plant anim offset falls back to PLANT_OFFSET'
        );
        return;
    }
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const objects: any[] = data?.objects || [];
        let count = 0;
        for (const obj of objects) {
            if (!obj || typeof obj !== 'object') continue;
            const aliases: string[] = Array.isArray(obj.aliases) ? obj.aliases.map(String) : [];
            if (aliases.includes('PlantPropertySheetTemplate')) continue;
            const od = obj.objdata || {};
            const art = od.ArtCenter;
            if (!art || typeof art.x !== 'number' || typeof art.y !== 'number') continue;
            registerArtCenterKeys(aliases, { x: art.x, y: art.y });
            count++;
        }
        for (const def of plantTypesList) {
            if (!plantArtCenterByKey.has(def.typeName)) {
                const viaAlias = def.alias ? plantArtCenterByKey.get(def.alias) : undefined;
                const viaLower = plantArtCenterByKey.get(def.typeName.toLowerCase());
                const found = viaAlias || viaLower;
                if (found) {
                    registerArtCenterKeys(
                        [def.typeName, def.alias].filter(Boolean) as string[],
                        found
                    );
                }
            }
        }
        console.log(
            `[PlantProperties] Loaded ArtCenter for ${count} sheets (${plantArtCenterByKey.size} keys)`
        );
    } catch (e) {
        console.error('[PlantProperties] Failed to parse PlantProperties.json:', e);
        plantArtCenterByKey.clear();
    }
}

/**
 * Worldmap plant-pop animation offset: -2 * ArtCenter from PlantProperties.json.
 * Do NOT use for sprout / packet. Falls back to PLANT_OFFSET when missing.
 */
export function getPlantAnimOffset(typeNameOrAlias: string): { x: number; y: number } {
    if (!typeNameOrAlias || plantArtCenterByKey.size === 0) {
        return { x: PLANT_OFFSET.x, y: PLANT_OFFSET.y };
    }
    const tryKeys: string[] = [typeNameOrAlias, typeNameOrAlias.toLowerCase()];
    const def = getPlantType(typeNameOrAlias);
    if (def) {
        if (def.alias) tryKeys.push(def.alias, def.alias.toLowerCase());
        if (def.typeName) tryKeys.push(def.typeName, def.typeName.toLowerCase());
    }
    tryKeys.push(`${typeNameOrAlias}Default`, `${typeNameOrAlias}Default`.toLowerCase());
    if (def?.typeName) {
        tryKeys.push(`${def.typeName}Default`, `${def.typeName}Default`.toLowerCase());
    }
    for (const k of tryKeys) {
        if (!k) continue;
        const art = plantArtCenterByKey.get(k);
        if (art) return { x: -2 * art.x, y: -2 * art.y };
    }
    return { x: PLANT_OFFSET.x, y: PLANT_OFFSET.y };
}

export function clearPlantPacketPreloadCache(): void {
    plantPacketPreloadCache.forEach(async (promise) => {
        try {
            const result = await promise;
            if (result?.url?.startsWith('blob:')) {
                URL.revokeObjectURL(result.url);
            }
        } catch {
            /* ignore */
        }
    });
    plantPacketPreloadCache.clear();
    warmedPlantAnimPaths.clear();
}

function packetCacheKey(typeName: string, worldName: string, resolution: number): string {
    const region = State.data.isChinaVersion ? 'cn' : 'ww';
    return `${typeName}|${worldName}|${resolution}|${region}`;
}

/**
 * Locate and parse convert/packages/PlantTypes.json from the uploaded pack.
 * Safe to call multiple times; no-ops when already loaded with the same pack.
 */
export async function loadPlantTypes(): Promise<void> {
    clearPlantTypeRegistry();

    if (!State.data.indexedFiles) return;

    let file: File | null = null;
    for (const [key, f] of State.data.indexedFiles.entries()) {
        const p = key.replace(/\\/g, '/');
        if (
            p === 'convert/packages/PlantTypes.json' ||
            p.endsWith('/packages/PlantTypes.json') ||
            p.endsWith('packages/PlantTypes.json')
        ) {
            file = f;
            break;
        }
    }
    // Fallback: globalFiles may keep the original relative path without convert/
    if (!file && State.data.globalFiles) {
        for (const key of Object.keys(State.data.globalFiles)) {
            const p = key.replace(/\\/g, '/');
            if (p.endsWith('packages/PlantTypes.json') || p.endsWith('/PlantTypes.json')) {
                file = State.data.globalFiles[key];
                break;
            }
        }
    }

    if (!file) {
        console.warn('[PlantTypes] convert/packages/PlantTypes.json not found in uploaded pack');
        await loadPlantProperties();
        return;
    }

    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const objects: any[] = data?.objects || [];
        const list: PlantTypeDef[] = [];

        for (const obj of objects) {
            if (!obj || typeof obj !== 'object') continue;
            // Accept PlantType and specialised subclasses (PlantTypeLemonaid, …)
            const cls: string = obj.objclass || '';
            if (!cls.startsWith('PlantType')) continue;

            const od = obj.objdata || {};
            const aliases: string[] = Array.isArray(obj.aliases) ? obj.aliases : [];
            const alias = (aliases[0] || od.TypeName || '').toString();
            const typeName = (od.TypeName || alias || '').toString();
            if (!typeName) continue;

            const def: PlantTypeDef = {
                alias,
                typeName,
                // Keep original casing from PlantTypes.json (no toLowerCase / toUpperCase)
                homeWorld: (od.HomeWorld || '').toString(),
                integerId: typeof od.IntegerID === 'number' ? od.IntegerID : -1,
                popAnim: (od.PopAnim || '').toString(),
                rarity: (od.Rarity || '').toString(),
                // objdata.Premium (e.g. PlantTypeHollyKnight)
                premium: !!od.Premium,
            };
            list.push(def);
            // Exact-case keys only — no case folding
            plantTypeByTypeName.set(typeName, def);
            if (alias) plantTypeByAlias.set(alias, def);
        }

        // Stable sort by IntegerID then typeName
        list.sort((a, b) => {
            if (a.integerId !== b.integerId) return a.integerId - b.integerId;
            return a.typeName.localeCompare(b.typeName);
        });
        plantTypesList = list;
        plantTypesLoaded = true;
        console.log(`[PlantTypes] Loaded ${list.length} plant types from PlantTypes.json`);
    } catch (e) {
        console.error('[PlantTypes] Failed to parse PlantTypes.json:', e);
    }

    // ArtCenter for plant-pop offset (-2 * ArtCenter); independent of type-load success
    await loadPlantProperties();
}

export function getPlantType(typeNameOrAlias: string): PlantTypeDef | undefined {
    if (!typeNameOrAlias) return undefined;
    // Exact match only — no toLowerCase / toUpperCase
    return plantTypeByTypeName.get(typeNameOrAlias) || plantTypeByAlias.get(typeNameOrAlias);
}

/**
 * Resolves any known TypeName OR alias (e.g. a raw node.m_dataString) to the canonical
 * PlantTypes.json TypeName. Every plant-resource lookup below starts here instead of each
 * deciding for itself whether its input is already a TypeName - m_dataString is not guaranteed
 * to already be one. Falls back to the raw input unchanged if it's not in the registry at all,
 * so an unrecognized identifier still gets used verbatim (best effort) rather than silently
 * dropped.
 */
export function getCanonicalPlantTypeName(typeNameOrAlias: string): string {
    return getPlantType(typeNameOrAlias)?.typeName || typeNameOrAlias;
}

/** Plants whose HomeWorld matches the given world logical name (exact match). */
export function getPlantsForHomeWorld(worldName: string): PlantTypeDef[] {
    if (!worldName) return [];
    return plantTypesList.filter((p) => p.homeWorld === worldName);
}

/** All known typeName values (for free-form fallback lists). */
export function getAllPlantTypeNames(): string[] {
    return plantTypesList.map((p) => p.typeName);
}

/**
 * Compose a single plant seed-packet (same logic as the former appendPacketComposite).
 * Returns null when required sprite files are missing.
 */
export async function composePlantPacketFor(
    typeNameOrAlias: string,
    worldName: string,
    resolution: number
): Promise<{ url: string; width: number; height: number } | null> {
    const typeName = getCanonicalPlantTypeName(typeNameOrAlias);
    const isChina = State.data.isChinaVersion;

    // China: exactly one directory per plant, decided up front by COMMON_PACKETS membership -
    // not "try UIActive, then poll UICommon and see which one has the file" like before.
    // UICommon carries plain ready/dots names (like the international build's initial/full
    // split); UIActive only ever has the _dynamic-suffixed variants.
    const isCommonPacket = isChina && COMMON_PACKETS.includes(typeName);
    const packetBaseDirs: string[] = isChina
        ? [isCommonPacket
            ? `images/${resolution}/UICommon/UI/packets/`
            : `images/${resolution}/UIActive/UI/packets/`]
        : [`images/${resolution}/initial/UI/packets/`];
    const chinaDotsSuffix = isChina && !isCommonPacket ? '_dynamic' : '';

    const findPacketFile = (filename: string): { file: File; baseDir: string; baseName: string } | null => {
        const baseName = filename.replace(/\.[^/.]+$/, '');
        for (const dir of packetBaseDirs) {
            // Explicit resolution for multi-res preload
            const file = findFileInGlobal(`${dir}${filename}`, resolution);
            if (file) return { file, baseDir: dir, baseName };
        }
        return null;
    };

    // Resolve plant metadata from PlantTypes.json (objdata.Premium / objdata.HomeWorld)
    const plantDef = getPlantType(typeName);
    const isPremium = plantDef?.premium === true;
    // Prefer plant HomeWorld; fall back to caller-supplied worldName. No case conversion.
    const homeWorld = plantDef?.homeWorld || worldName || '';

    // Base packet frame:
    //   Premium → ready_premium(.png / _dynamic.png for China's UIActive)
    //   else HomeWorld → getPacketName(homeWorld) (tutorial→ready, modern→modernday, …) [international]
    //                  → ready(.png) / ready_dynamic.png per the directory picked above [China]
    let baseResult: { file: File; baseDir: string; baseName: string } | null = null;
    if (isPremium) {
        baseResult = findPacketFile(isChina ? `ready_premium${chinaDotsSuffix}.png` : 'ready_premium.png');
    }
    if (!baseResult) {
        if (isChina) {
            baseResult = findPacketFile(`ready${chinaDotsSuffix}.png`);
        } else {
            const basePacketKey = getPacketName(homeWorld || worldName);
            baseResult = findPacketFile(`${basePacketKey}.png`);
            if (!baseResult) baseResult = findPacketFile('ready.png');
        }
    }
    if (!baseResult) return null;

    // Plant art on the packet
    // isLinear==true  (intl + China): PACKET_PLANT_MAP[typeName] || typeName
    // isLinear==false (intl + China): PACKET_PLANT_MAP[typeName] || PLANT_NAME_MAP[typeName]
    // PLANT_NAME_MAP is shared by both builds; CHINA_PLANT_NAME_MAP is unused.
    let plantResult: { file: File; baseDir: string; baseName: string } | null = null;
    const primaryArtName = State.data.isLinear
        ? (PACKET_PLANT_MAP[typeName] || typeName)
        : (PACKET_PLANT_MAP[typeName] || PLANT_NAME_MAP[typeName] || typeName);
    plantResult = findPacketFile(`${primaryArtName}.png`);
    if (!plantResult) return null;

    const dotsSuffix = isChina ? chinaDotsSuffix : (baseResult.baseDir.includes('UIActive') ? '_dynamic' : '');
    const dotsLeftResult = findPacketFile(`dots_left${dotsSuffix}.png`);
    const dotsBottomResult = findPacketFile(`dots_bottom${dotsSuffix}.png`);
    const dotsRightResult = findPacketFile(`dots_right${dotsSuffix}.png`);
    if (!dotsLeftResult || !dotsBottomResult || !dotsRightResult) return null;

    const scale = animScale1536(resolution);
    const scaleOffset = (o: { x: number; y: number }) => ({ x: o.x * scale, y: o.y * scale });

    const metaGet = (rawKey: string): { x: number; y: number } => {
        const k = rawKey.replace(/\\/g, '/');
        const meta = State.data.plantPacketMeta;

        let offset = meta.get(k);
        if (offset) return offset;

        const baseName = k.substring(k.lastIndexOf('/') + 1);
        const prefixMatch = k.match(/^(images\/\d+\/)/);
        const prefix = prefixMatch ? prefixMatch[1] : '';

        if (State.data.isChinaVersion) {
            const candidateKeys = [
                `${prefix}UIImages/UI/packets/${baseName}`,
                `${prefix}UIImages_Dynamic/UI/packets/${baseName}`,
                `UIImages/UI/packets/${baseName}`,
                `UIImages_Dynamic/UI/packets/${baseName}`,
            ];
            for (const candidate of candidateKeys) {
                if (candidate === k) continue;
                offset = meta.get(candidate);
                if (offset) return offset;
            }
        }

        const relative = k.replace(/^images\/\d+\//, '');
        offset = meta.get(relative);
        if (offset) return offset;

        for (const [path, off] of meta) {
            if (path === baseName || path.endsWith('/' + baseName)) return off;
        }
        return { x: 0, y: 0 };
    };

    const dirTag = baseResult.baseDir.includes('UIActive')
        ? 'active'
        : baseResult.baseDir.includes('UICommon')
            ? 'common'
            : 'init';
    // Cache key includes base frame identity (premium / HomeWorld frame) + plant art
    const cacheKey = [
        baseResult.baseName,
        plantResult.baseName,
        resolution,
        State.data.isChinaVersion ? 'cn' : 'ww',
        dirTag,
        isPremium ? 'premium' : (homeWorld || worldName || 'default'),
    ].join('_');

    const layers: LayerDef[] = [
        {
            file: baseResult.file,
            offset: scaleOffset(metaGet(`${baseResult.baseDir}${baseResult.baseName}`)),
        },
        {
            file: plantResult.file,
            offset: scaleOffset(metaGet(`${plantResult.baseDir}${plantResult.baseName}`)),
        },
        {
            file: dotsLeftResult.file,
            offset: scaleOffset(metaGet(`${dotsLeftResult.baseDir}${dotsLeftResult.baseName}`)),
        },
        {
            file: dotsBottomResult.file,
            offset: scaleOffset(metaGet(`${dotsBottomResult.baseDir}${dotsBottomResult.baseName}`)),
        },
        {
            file: dotsRightResult.file,
            offset: scaleOffset(metaGet(`${dotsRightResult.baseDir}${dotsRightResult.baseName}`)),
        },
    ];

    try {
        return await getComposedPacketCached(cacheKey, layers);
    } catch (e) {
        console.warn('[PlantTypes] compose packet failed for', typeName, worldName, e);
        return null;
    }
}

/**
 * Look up a preloaded packet.
 * Packet base is derived from the plant's HomeWorld / Premium (not the open map),
 * so the cache is keyed by typeName + that identity. Falls back to on-demand compose.
 */
export function getPreloadedPlantPacket(
    typeName: string,
    worldName: string,
    resolution: number
): Promise<{ url: string; width: number; height: number } | null> {
    const plantDef = getPlantType(typeName);
    // Prefer HomeWorld from PlantTypes; worldName is only a fallback for unregistered names
    const keyWorld = plantDef?.homeWorld || worldName || PACKET_DEFAULT_WORLD;
    const cacheKey = packetCacheKey(typeName, keyWorld, resolution);
    let promise = plantPacketPreloadCache.get(cacheKey);
    if (promise) return promise;

    // Preload at Start used PACKET_DEFAULT_WORLD when HomeWorld was empty
    const defaultKey = packetCacheKey(typeName, PACKET_DEFAULT_WORLD, resolution);
    if (keyWorld !== PACKET_DEFAULT_WORLD) {
        promise = plantPacketPreloadCache.get(defaultKey);
        if (promise) {
            plantPacketPreloadCache.set(cacheKey, promise);
            return promise;
        }
    }

    promise = composePlantPacketFor(typeName, keyWorld, resolution);
    plantPacketPreloadCache.set(cacheKey, promise);
    return promise;
}

/** Fallback world tag when a plant has no HomeWorld. getPacketName falls through → ready.png. */
export const PACKET_DEFAULT_WORLD = '__default__';

function plantAnimPath(typeNameOrAlias: string, resolution: number): string {
    const typeName = getCanonicalPlantTypeName(typeNameOrAlias);

    // ALL plant animation folders are keyed by PLANT_NAME_MAP[typeName] (getPlantResourceName).
    // China: images/{res}/plant1|plant2/plant/{animName}/  (note the extra /plant/ segment)
    // International: images/{res}/initial|full/plant/{animName}/
    // China plant1 vs plant2 membership stays on TypeName (CHINA_PLANT1_LIST).
    const animName = getPlantResourceName(typeName);

    if (State.data.isChinaVersion) {
        const group = CHINA_PLANT1_LIST.includes(typeName) ? 'plant1' : 'plant2';
        return `images/${resolution}/${group}/plant/${animName}/`;
    }

    const baseDir = INITIAL_PLANTS.includes(animName) ? 'initial' : 'full';
    return `images/${resolution}/${baseDir}/plant/${animName}/`;
}

/** China: images/{res}/UICommon/worldmap/sprout/ - entirely different from the international
 * images/{res}/initial/worldmap/sprout/ structure (no initial/full tag, UICommon instead).
 * Single shared implementation - both preloadAllPlantAssets (below) and
 * events/resolvers/plant.ts's resolvePlantResources import this rather than each keeping their
 * own copy of the same path logic. */
export function sproutAnimPath(resolution: number): string {
    return State.data.isChinaVersion
        ? `images/${resolution}/UICommon/worldmap/sprout/`
        : `images/${resolution}/initial/worldmap/sprout/`;
}

/**
 * Discover every images/<N>/ resolution tier in the uploaded pack.
 * Always includes CONFIG.animJsonRes (768) and the current textureResolution.
 */
export function discoverImageResolutions(): number[] {
    const found = new Set<number>();
    const scanKey = (key: string) => {
        const m = key.replace(/\\/g, '/').match(/(?:^|\/)images\/(\d+)\//);
        if (m) found.add(Number(m[1]));
    };
    if (State.data.indexedFiles) {
        for (const key of State.data.indexedFiles.keys()) scanKey(key);
    }
    if (State.data.filesByDir) {
        for (const key of State.data.filesByDir.keys()) scanKey(key);
    }
    found.add(Number(CONFIG.animJsonRes) || 768);
    if (State.data.textureResolution) found.add(State.data.textureResolution);
    return Array.from(found).filter((n) => n > 0).sort((a, b) => a - b);
}

/**
 * Warm one plant's PAM at the given texture resolution.
 * Caller must set State.data.textureResolution so PNG frames resolve from images/<res>/.
 * JSON always comes from images/768/ (animJsonRes) via findAnimInGlobal.
 */
export async function warmPlantAnimation(typeName: string, resolution: number): Promise<void> {
    const path = `${plantAnimPath(typeName, resolution)}@${resolution}`;
    if (warmedPlantAnimPaths.has(path)) return;
    const anim = findAnimInGlobal(plantAnimPath(typeName, resolution));
    if (anim && anim.json && anim.files.length) {
        await compileAnimAssets(anim);
        warmedPlantAnimPaths.add(path);
    } else if (anim && anim.json) {
        warmedPlantAnimPaths.add(path);
    }
}

export function getPlantAnimFolder(typeName: string, resolution: number) {
    return findAnimInGlobal(plantAnimPath(typeName, resolution));
}

export interface PlantDropdownOption {
    name: string;
    el: HTMLButtonElement;
    starEl: HTMLSpanElement;
}

let plantDropdownOptionsByName: Map<string, PlantDropdownOption> | null = null;
let plantDropdownDefaultOrder: PlantDropdownOption[] | null = null;
let plantDropdownOrderByWorld: Map<string, PlantDropdownOption[]> | null = null;
let plantDropdownHomeSetByWorld: Map<string, Set<string>> | null = null;

/**
 * Builds the session-persistent set of plant-picker <button> option elements (one per distinct
 * typeName, each created exactly once for the whole session) plus a per-world display order
 * and home-world-star set, all up front. Called from handleStartViewer's preload pass so that
 * opening the Event Property Editor's plant/plantbox field is instant the very first time a
 * user does it, not just after a first (laggy) use has warmed a lazily-built cache -
 * EventPropertyEditor.ts's buildPlantDropdown() only ever reparents these existing elements
 * into whichever dropdown currently needs them; it never creates or sorts anything itself.
 */
export function preparePlantDropdownAssets(): void {
    if (plantDropdownOptionsByName) return; // idempotent - safe to call more than once

    const seen = new Set<string>();
    const names: string[] = [];
    for (const p of plantTypesList) {
        if (!p.typeName || seen.has(p.typeName)) continue;
        seen.add(p.typeName);
        names.push(p.typeName);
    }
    names.sort((a, b) => a.localeCompare(b));

    plantDropdownOptionsByName = new Map();
    const defaultOrder: PlantDropdownOption[] = [];
    for (const name of names) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'event-editor-plant-option';
        (el as any)._plantName = name;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'event-editor-plant-option-name';
        nameSpan.textContent = name;
        el.appendChild(nameSpan);

        const starEl = document.createElement('span');
        starEl.className = 'event-editor-plant-option-star';
        starEl.textContent = '★';
        starEl.style.display = 'none';
        el.appendChild(starEl);

        const option: PlantDropdownOption = { name, el, starEl };
        plantDropdownOptionsByName.set(name, option);
        defaultOrder.push(option);
    }
    plantDropdownDefaultOrder = defaultOrder;

    const worldNames = new Set<string>();
    for (const p of plantTypesList) {
        if (p.homeWorld) worldNames.add(p.homeWorld);
    }
    plantDropdownOrderByWorld = new Map();
    plantDropdownHomeSetByWorld = new Map();
    for (const worldName of worldNames) {
        const home: PlantDropdownOption[] = [];
        const other: PlantDropdownOption[] = [];
        const homeNames = new Set<string>();
        for (const opt of defaultOrder) {
            const def = plantTypeByTypeName.get(opt.name);
            if (def && def.homeWorld === worldName) {
                home.push(opt);
                homeNames.add(opt.name);
            } else {
                other.push(opt);
            }
        }
        plantDropdownOrderByWorld.set(worldName, home.concat(other));
        plantDropdownHomeSetByWorld.set(worldName, homeNames);
    }
}

/** Pure lookup - everything was already computed by preparePlantDropdownAssets(). Falls back to
 * the default alphabetical order + no stars for an unrecognized/empty world name. */
export function getPlantDropdownOptionsForWorld(worldName: string): {
    options: PlantDropdownOption[];
    homeSet: Set<string>;
} {
    if (!plantDropdownOptionsByName) {
        // Should only happen if Start preload hasn't run yet (e.g. dev/debug path) - build now as
        // a fallback rather than leave the dropdown empty, but this is not the intended hot path.
        preparePlantDropdownAssets();
    }
    const options =
        (worldName && plantDropdownOrderByWorld?.get(worldName)) ||
        plantDropdownDefaultOrder ||
        [];
    const homeSet = (worldName && plantDropdownHomeSetByWorld?.get(worldName)) || new Set<string>();
    return { options, homeSet };
}

export type PlantPreloadProgress = (phase: string, current: number, total: number) => void;

/**
 * Preload plant PAM (JSON @ 768 + PNG @ each res) and packets for EVERY images/<res>/
 * tier present in the pack — not current resolution only.
 */
export async function preloadAllPlantAssets(
    onProgress?: PlantPreloadProgress
): Promise<void> {
    if (!plantTypesLoaded || plantTypesList.length === 0) {
        await loadPlantTypes();
    }
    if (plantTypesList.length === 0) {
        console.warn('[PlantTypes] No plant types to preload');
        return;
    }

    const resolutions = discoverImageResolutions();
    const savedRes = State.data.textureResolution;
    const plantCount = plantTypesList.length;
    const totalUnits = plantCount * resolutions.length;

    console.log(
        `[PlantTypes] Preloading plant assets for resolutions: [${resolutions.join(', ')}] ` +
        `(${plantCount} plants each)`
    );

    try {
        let animDone = 0;
        onProgress?.('plant-anims', 0, totalUnits);
        const ANIM_BATCH = 32;

        for (const res of resolutions) {
            State.data.textureResolution = res;

            const sprout = findAnimInGlobal(sproutAnimPath(res));
            if (sprout && sprout.json && sprout.files.length) {
                await compileAnimAssets(sprout);
            }

            for (let i = 0; i < plantTypesList.length; i += ANIM_BATCH) {
                const batch = plantTypesList.slice(i, i + ANIM_BATCH);
                await Promise.all(batch.map((p) => warmPlantAnimation(p.typeName, res)));
                animDone += batch.length;
                onProgress?.('plant-anims', animDone, totalUnits);
            }
        }

        let packetDone = 0;
        onProgress?.('plant-packets', 0, totalUnits);
        const PACKET_BATCH = 64;

        for (const res of resolutions) {
            State.data.textureResolution = res;

            for (let i = 0; i < plantTypesList.length; i += PACKET_BATCH) {
                const batch = plantTypesList.slice(i, i + PACKET_BATCH);
                await Promise.all(
                    batch.map((p) => {
                        const keyWorld = p.homeWorld || PACKET_DEFAULT_WORLD;
                        const key = packetCacheKey(p.typeName, keyWorld, res);
                        let promise = plantPacketPreloadCache.get(key);
                        if (!promise) {
                            promise = composePlantPacketFor(p.typeName, keyWorld, res);
                            plantPacketPreloadCache.set(key, promise);
                        }
                        return promise;
                    })
                );
                packetDone += batch.length;
                onProgress?.('plant-packets', packetDone, totalUnits);
            }
        }

        console.log(
            `[PlantTypes] Preloaded ${plantCount} plants × ${resolutions.length} resolutions ` +
            `(anims + packets @ [${resolutions.join(', ')}])`
        );
    } finally {
        State.data.textureResolution = savedRes;
    }
}

/**
 * Drop plant packet blobs and re-compose under the current resolution / China flag.
 * Called when the user toggles 中国版本 or texture resolution.
 */
export async function rebuildPlantPacketCache(
    onProgress?: PlantPreloadProgress
): Promise<void> {
    clearPlantPacketPreloadCache();
    // composedPacketCache keys include resolution / region — flush so getComposedPacketCached
    // does not return stale blobs from the previous setting.
    clearComposedPacketCache();
    warmedPlantAnimPaths.clear();
    await preloadAllPlantAssets(onProgress);
}

export function isPlantTypesLoaded(): boolean {
    return plantTypesLoaded;
}