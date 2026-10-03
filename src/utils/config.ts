export interface AppConfig {
  baseMaxZoom: number;
  baseMinZoom: number;
  baseInitialZoom: number;
  referenceHeight: number;
  imageCleanupDelay: number;
  throttleDelay: number;
  filePrefix: string;
  fileExt: string;
  animJsonRes: string;
}

export const CONFIG: AppConfig = Object.freeze({
  baseMaxZoom: 1.0,
  baseMinZoom: 0.2,
  baseInitialZoom: 0.666666666666,
  referenceHeight: 1536,
  imageCleanupDelay: 30000,
  throttleDelay: 5,
  filePrefix: 'island',
  fileExt: '.png',
  animJsonRes: '768',
});

export const EXCLUDED_KEYWORDS: readonly string[] = Object.freeze([
  'danger_node', 'zomboss_node', 'common', 'yeti', 'sprout',
  'pinatas', 'path', 'level', 'giftbox', 'gate', 'anim',
  'goldStar_icon', 'sod', 'game_upgrade_icons', 'map_node_arrow', '.'
]);
