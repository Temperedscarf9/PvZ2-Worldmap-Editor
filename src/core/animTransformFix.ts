import { State } from './state';

export type AnimFix = { k: number; s: number };

const S_1536_1200 = 1536 / 1200;
const K_DOC_2 = 1;              // 文档 k=2
const K_DOC_1536_600 = 1536 / 1200; // 文档 k=1536/600，再乘公式里的 *2

/** 国际版 + 线性：命中表内 worldId/animId 时 文档 s=1536/1200, k=2 */
export const ANIM_TRANSFORM_FIXES_DEFAULT: Array<{
    worldIds: number[];
    animIds: number[] | null;
    fix: AnimFix;
}> = [
    { worldIds: [2], animIds: [9], fix: { k: K_DOC_2, s: S_1536_1200 } },
    { worldIds: [3], animIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], fix: { k: K_DOC_2, s: S_1536_1200 } },
    { worldIds: [4], animIds: [2, 3, 4, 5, 10, 11], fix: { k: K_DOC_2, s: S_1536_1200 } },
    { worldIds: [5], animIds: [1, 2, 3, 4, 5], fix: { k: K_DOC_2, s: S_1536_1200 } },
    //{ worldIds: [6], animIds: [21], fix: { k: 1, s: 1.28 } },// dark working imp path in v2.4.1
    //{ worldIds: [7], animIds: [30], fix: { k: 1, s: 1.28 } },// beach working imp path in v2.9.1
    { worldIds: [8], animIds: [21], fix: { k: 1, s: 1.28 } },// iceage working imp path in v3.2.1
    //{ worldIds: [9], animIds: [21], fix: { k: 1, s: 1.28 } },// lostcity working imp path in v3.6.1
    { worldIds: [11], animIds: [28, 29, 30, 31, 32, 33], fix: { k: K_DOC_2, s: S_1536_1200 } },

];

/** 中国版 + 线性：沿用当前 CN 修正表（未改数值） */
export const ANIM_TRANSFORM_FIXES_CN: Array<{
    worldIds: number[];
    animIds: number[] | null;
    fix: AnimFix;
}> = [
    { worldIds: [3], animIds: [1, 2, 3, 4], fix: { k: 1, s: 1.28 } },
    { worldIds: [5], animIds: [1, 2, 3, 4, 5], fix: { k: 1, s: 1.28 } },
    { worldIds: [6], animIds: [1, 2, 3, 4, 5, 6, 7, 8, 9], fix: { k: 1, s: 1.28 } },
    { worldIds: [7], animIds: [1, 2, 3, 4, 5, 6, 7], fix: { k: 1, s: 1.28 } }, // dark
    { worldIds: [8], animIds: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], fix: { k: 1, s: 1.28 } },
    {
        worldIds: [9],
        animIds: [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
        ],
        fix: { k: 1, s: 1.28 },
    },
    {
        worldIds: [10],
        animIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
        fix: { k: 1, s: 1.28 },
    },
    { worldIds: [11], animIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], fix: { k: 1, s: 1.28 } },
];

/** 国际线性未命中表：文档 s=1, k=1536/600 */
export const DEFAULT_FIX: AnimFix = { k: K_DOC_1536_600, s: 1 };
/** 国际线性 worldId≥12 且 animId∈{3,6,7,8,9,11}：文档 s=1, k=2 */
export const HIGH_WORLD_FIX: AnimFix = { k: K_DOC_2, s: 1 };
/** 非线性：文档 s=1536/1200, k=2，无跳转条件 */
export const NON_LINEAR_FIX: AnimFix = { k: K_DOC_2, s: S_1536_1200 };

/**
 * 动画岛 / doodad 动画 transform 修正：
 * - isLinear==false → 固定 NON_LINEAR_FIX（无 world/anim 分支）
 * - isChina && isLinear → ANIM_TRANSFORM_FIXES_CN（当前中国版表）
 * - !isChina && isLinear → 国际线性表；worldId≥12 特殊；其余 DEFAULT_FIX
 */
export function getAnimTransformFix(worldId: number, animId: number): AnimFix {
    const isChina = State.data.isChinaVersion;
    const isLinear = State.data.isLinear;

    // 非线性：无条件统一修正
    if (!isLinear) {
        return NON_LINEAR_FIX;
    }

    // 中国版 + 线性：沿用现有 CN 表
    if (isChina) {
        const entry = ANIM_TRANSFORM_FIXES_CN.find(
            (r) => r.worldIds.includes(worldId) && (!r.animIds || r.animIds.includes(animId))
        );
        return entry?.fix ?? DEFAULT_FIX;
    }

    // 国际版 + 线性
    if (worldId >= 12 && [3, 6, 7, 8, 9, 11].includes(animId)) {
        return HIGH_WORLD_FIX;
    }
    const entry = ANIM_TRANSFORM_FIXES_DEFAULT.find(
        (r) => r.worldIds.includes(worldId) && (!r.animIds || r.animIds.includes(animId))
    );
    return entry?.fix ?? DEFAULT_FIX;
}