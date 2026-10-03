export { CONFIG, EXCLUDED_KEYWORDS } from './config';
export type { AppConfig } from './config';
export {
  UPGRADE_MAP,
  CHINA_MAGIC_BONUS_MAP,
  INITIAL_PLANTS,
  PLANT_NAME_MAP,
  getPlantResourceName,
  COMMON_PACKETS,
  CHINA_PLANT1_LIST,
} from './plantMetadata';
export {
  WORLD_TO_RES_DIR,
  RES_DIR_TO_WORLD,
  WORLD_TO_PINATA,
  WORLD_TO_PACKET,
  getResDirName,
  getPinataName,
  getPacketName,
} from './worldMappings';
export { toTexturePath, toJsonPath, toTextureKey } from './pathResolver';

export const LEVEL_NODE_OFFSET = Object.freeze({ x: -98 * 2, y: -104 * 2 });
export const BOSS_NODE_OFFSET_STAGE = Object.freeze({ x: -76 * 2.56, y: -90 * 2.56 });
export const BOSS_NODE_OFFSET_HOLOGRAM = Object.freeze({ x: -76 * 2.56, y: -180 * 2.56 });
export const PLANT_OFFSET = Object.freeze({ x: -98 * 2, y: -115 * 2 });
export const STAR_GATE_OFFSET = Object.freeze({ x: -92 * 2, y: -134 * 2 });
export const KEY_GATE_OFFSET = Object.freeze({ x: -76 * 2.56, y: -96 * 2.56 });
export const GIFTBOX_OFFSET = Object.freeze({ x: -100 * 2, y: -100 * 2 });
export const PINATA_ANCHOR_Y_RATIO = 0.31 * 2.56;
export const UPGRADE_ANCHOR_Y_RATIO = 0.34 * 2.56;
export const PACKET_ANCHOR_Y_RATIO = 0.34 * 2;