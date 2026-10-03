export const UPGRADE_MAP: Readonly<Record<string, string>> = Object.freeze({




  'pf_slots_lvl1': 'plantfood_slot',
  'starting_sun_lvl1': 'starting_sun',
  'sunshovel_lvl1': 'sun_shovel',
  '7_slots': 'seedbank_slot',
  'wallnut_firstaid': 'wallnut_firstaid',
  'pf_refresh': 'plantfood_refresh',
  'sunshovel_lvl2': 'sun_shovel',
  'manual_mowers_1': 'manual_mowers',

  'feature_quest_pinata_hunt_slot_1': 'pinatahunt_slot',
  'feature_quest_pinata_hunt_slot_2': 'pinatahunt_slot',

  // only exist on china version map
  'startingsun2': 'starting_sun',
  'startingsun3': 'starting_sun',
  'startingsun4': 'starting_sun',
  'pf_slots_lvl3': 'plantfood_slot',
  '6_slots': 'seedbank_slot',
  'seedslot2': 'seedbank_slot',
  'sunshovel3':'sun_shovel',
  'sunshovel_lvl4':'sun_shovel',



  'bonus_gold_1': 'gold_1',
  'bonus_gold_2': 'gold_2',
  'bonus_gold_3': 'gold_3',
  'bonus_gold_4': 'gold_3',
  'bonus_gold_5': 'gold_3',
  'bonus_gold_6': 'gold_3',
  'bonus_gold_7': 'gold_3',
  'bonus_gold_8': 'gold_3',
  'bonus_gold_9': 'gold_3',
  'bonus_gold_10': 'gold_3',
  'bonus_gold_11': 'gold_3',
  'bonus_gold_12': 'gold_3',
  'bonus_gold_13': 'gold_3',
  'bonus_gold_14': 'gold_3',
  'bonus_gold_15': 'gold_3',
  'bonus_gold_16': 'gold_3',
  'bonus_gold_17': 'gold_3',
  'bonus_gold_18': 'gold_3',
  'bonus_gold_19': 'gold_3',
  'bonus_gold_20': 'gold_3',
  'bonus_gold_21': 'gold_3',
  'bonus_gold_22': 'gold_3',
  'bonus_gold_23': 'gold_3',
  'bonus_diamond_1': 'diamond',
  'bonus_diamond_2': 'diamond',
  'bonus_diamond_3': 'diamond',
  'bonus_diamond_4': 'diamond',
  'bonus_diamond_5': 'diamond',
  'bonus_diamond_6': 'diamond',
  'bonus_diamond_7': 'diamond',
  'bonus_diamond_8': 'diamond',
  'feature_mower_type_1': 'mower_1',
  'feature_mower_type_2': 'mower_2',
  'feature_mower_type_3': 'mower_3',
  'feature_mower_type_4': 'mower_4',
  'feature_mower_type_5': 'mower_5',
  'feature_mower_type_6': 'mower_6',
  'feature_mower_type_7': 'mower_7',
  'feature_mower_type_8': 'mower_8',
  'feature_mower_type_10': 'mower_10',
  'feature_cannon_1': 'canon1',
  'feature_shield_1': 'shield1',

});

/**
 * China-only "magic bonus" events - m_dataString values matching this table do NOT follow the
 * regular UPGRADE_MAP + upgrade_%s.png convention at all: their icon lives at
 * images/{res}/UIActive/worldmap/common/magic_{value}.png instead. Any m_dataString not in this
 * table (China or international) falls through to UPGRADE_MAP unchanged - this is a narrow
 * exception for exactly these identifiers, not a parallel upgrade system.
 */
export const CHINA_MAGIC_BONUS_MAP: Readonly<Record<string, string>> = Object.freeze({
  'bonus_magic_drum_1': 'drum',
  'bonus_magic_drum_2': 'drum',
  'bonus_magic_drum_3': 'drum',
  'bonus_magic_drum_4': 'drum',
  'bonus_magic_drum_5': 'drum',
  'bonus_magic_fertilizer_1': 'fertilizer',
  'bonus_magic_fertilizer_2': 'fertilizer',
  'bonus_magic_fertilizer_3': 'fertilizer',
  'bonus_magic_fertilizer_4': 'fertilizer',
  'bonus_magic_fertilizer_5': 'fertilizer',
  'bonus_magic_pole_1': 'pole',
  'bonus_magic_pole_2': 'pole',
  'bonus_magic_pole_3': 'pole',
  'bonus_magic_pole_4': 'pole',
  'bonus_magic_pole_5': 'pole',
  'bonus_magic_regeneration_1': 'regeneration',
  'bonus_magic_regeneration_2': 'regeneration',
  'bonus_magic_regeneration_3': 'regeneration',
  'bonus_magic_regeneration_4': 'regeneration',
  'bonus_magic_regeneration_5': 'regeneration',
  'bonus_magic_snowflake_1': 'snowflake',
  'bonus_magic_snowflake_2': 'snowflake',
  'bonus_magic_snowflake_3': 'snowflake',
  'bonus_magic_snowflake_4': 'snowflake',
  'bonus_magic_snowflake_5': 'snowflake',
  'bonus_magic_torch_1': 'torch',
  'bonus_magic_torch_2': 'torch',
  'bonus_magic_torch_3': 'torch',
  'bonus_magic_torch_4': 'torch',
  'bonus_magic_torch_5': 'torch',
});

// 值为动画资源名
export const INITIAL_PLANTS: readonly string[] = Object.freeze([
  'aloe',
  'applemortar',
  'bamboospartan',
  'beansprout',
  'blockoli',
  'bloomerang',
  'blooming_hearts',
  'boingsetta',
  'bombegranate',
  'bonkchoy',
  'boomballoon',
  'boomberry',
  'bramblebush',
  'buduhboom',
  'buttercup',
  'buzzbutton',
  'cabbagepult',
  'cactus',
  'caulipower',
  'chillypepper',
  'chomper',
  'cold_snapdragon',
  'cranjelly',
  'dandelion',
  'dartichoke',
  'dazey_chain',
  'draftodil',
  'electric_peashooter',
  'electricblueberry',
  'electriccurrant',
  'electrici_tea',
  'escaperoot',
  'explodeonut',
  'explodeovine',
  'firepeashooter',
  'fumeshroom',
  'ghostpepper',
  'gloomvine',
  'goldbloom',
  'goopeashooter',
  'grapeshot',
  'gravebuster',
  'gumnut',
  'headbutter_lettuce',
  'heathseeker',
  'hocus_crocus',
  'holly',
  'hotdate',
  'hurrikale',
  'homingthistle',
  'hypnoshroom',
  'ice_bloom',
  'iceburg',
  'Iceweed',
  'imitater',
  'Impear',
  'inferno',
  'jackolantern',
  'jalapeno',
  'jalapeno',
  'kernalpult',
  'kiwibeast',
  'lavaguava',
  'levitater',
  'marigold',
  'maybee',
  'megagatling',
  'Melonpult',
  'meteorflower',
  'missile_toe',
  'murkadamia_nut',
  'noctarine',
  'olivepit',
  'parsnip',
  'peanut',
  'peashooter',
  'pokra',
  'potatomine',
  'powerlily',
  'powervine',
  'puffball',
  'puffshroom',
  'pumpkin',
  'pvine',
  'repeater',
  'rhubarbarian',
  'sapfling',
  'scaredyshroom',
  'seaflora',
  'shadowpeashooter',
  'ShineVine',
  'shrinking_violet',
  'slingpea',
  'snappea',
  'snowpea',
  'solar_tomato',
  'solarsage',
  'squash',
  'starfruit',
  'stickybomb_rice',
  'strawburst',
  'sundewtangler',
  'sunflower',
  'sunflower_twin',
  'sweetpotato',
  'teleportato',
  'threepeater',
  'tiger_grass',
  'toadstool',
  'tombtangler',
  'torchwood',
  'tumbleweed',
  'turkeypult',
  'ultomato',
  'vamporcini',
  'vine_blastberry',
  'vine_pyre',
  'wallnut',
  'wasabiwhip',
  'waterrabbit',
  'witch_hazel',
  'zoybeanpod',
]);

// 值为 逻辑名：动画资源名
export const PLANT_NAME_MAP: Readonly<Record<string, string>> = Object.freeze({
  'kernelpult': 'kernalpult',
  'blover': 'blowver',
  'laser_bean': 'laserbean',
  'empea': 'empeach',
  'holonut': 'infinut',
  'magnifyinggrass': 'magnifying_grass',
  'cherry_bomb': 'cherrybomb',
  'powerplant': 'powerplant_proto',
  'melonpult': 'Melonpult',
  'primalpeashooter': 'primal_peashooter',
  'primalwallnut': 'primal_wallnut',
  'primalsunflower': 'primal_sunflower',
  'primalpotatomine': 'primal_potatomine',
  'perfumeshroom': 'perfshroom',
  'twinsunflower': 'sunflower_twin',
  'goldleaf': 'Goldleaf',
  'xshot': 'rotorutabaga',
  'phatbeet': 'phatbeets',
  'blastspinner': 'blastspinner_cocoon',
  'shinevine': 'ShineVine',
  'bloominghearts': 'blooming_hearts',
  'boomflower': 'boomballoon',
  'coldsnapdragon': 'cold_snapdragon',
  'cornfetti': 'cornfettipopper',
  'dazeychain': 'dazey_chain',
  'electricpeashooter': 'electric_peashooter',
  'electricitea': 'electrici_tea',
  'poisonpeashooter': 'goopeashooter',
  'headbutter': 'headbutter_lettuce',
  'hocus': 'hocus_crocus',
  'hollyknight': 'holly',
  'icebloom': 'ice_bloom',
  'missiletoe': 'missile_toe',
  'murkadamia': 'murkadamia_nut',
  'shrinkingviolet': 'shrinking_violet',
  'solartomato': 'solar_tomato',
  'stickybombrice': 'stickybomb_rice',
  'teleportatomine': 'teleportato',
  'tigergrass': 'tiger_grass',
  'blastberry': 'vine_blastberry',
  'pyrevine': 'vine_pyre',
  'witchhazel': 'witch_hazel',






  // China version
  lotusshower:'lotushooter',
});


export const PACKET_PLANT_MAP: Readonly<Record<string, string>> = Object.freeze({

  'groundcherry': 'Groundcherry',
  'horsebean': 'Horsebean',
  'asparagus': 'Asparagus',
  'saucer': 'Saucer',
  'melonpult': 'Melonpult',
  'goldleaf': 'Goldleaf',
  'iceweed': 'Iceweed',
  'impear': 'Impear',

});
// ---- China-version plant classification tables ----
// Both keyed by PlantTypes.json TypeName (not alias, not animation-resource-name) - see
// core/resources/plantTypes.ts's getPlantType()/getCanonicalPlantTypeName() for the single
// place m_dataString gets resolved to a TypeName before any of these tables are consulted.

/**
 * China build: which plants' seed-packet base/art/dots sprites live under
 * images/{res}/UICommon/UI/packets/ (has plain 'ready'/'dots' names) rather than
 * images/{res}/UIActive/UI/packets/ (only has 'ready_dynamic'/'dots_*_dynamic' names).
 * Membership decides which ONE directory to look in - not "try one, then poll the other".
 */
export const COMMON_PACKETS: readonly string[] = Object.freeze([
  'sunflower', 'peashooter', 'wallnut', 'tallnut', 'bonkchoy', 'cabbagepult', 'melonpult',
  'cherry_bomb', 'coconutcannon', 'gravebuster', 'iceburg', 'laser_bean', 'potatomine',
  'repeater', 'snapdragon', 'spikeweed', 'threepeater', 'torchwood', 'kernelpult',
  'springbean', 'snowpea', 'chilibean', 'splitpea', 'lightningreed', 'peapod',
  'magnifyinggrass', 'bloomerang', 'holonut', 'empea', 'blover', 'starfruit', 'imitater',
  'jalapeno', 'wintermelon', 'twinsunflower', 'marigold', 'spikerock', 'powerlily', 'squash',
  'turnip', 'firegourd', 'peach', 'bamboo', 'citron', 'powerplant',
]);

/**
 * China build: which plants' pop animation lives under images/{res}/plant1/{name}/ rather than
 * images/{res}/plant2/{name}/ - the China build doesn't share one grouping between packet art
 * and animation the way the international build's initial/full split does, so this is a
 * separate table from COMMON_PACKETS (compare: 'laser_bean' and 'firegourd' are packet-common
 * but not plant1; many plant1 entries like 'smallcherry' or 'anthurium' aren't in
 * COMMON_PACKETS at all).
 */
export const CHINA_PLANT1_LIST: readonly string[] = Object.freeze([
  'sunflower', 'peashooter', 'wallnut', 'tallnut', 'bonkchoy', 'cabbagepult', 'melonpult',
  'cherry_bomb', 'coconutcannon', 'gravebuster', 'iceburg', 'potatomine', 'repeater',
  'snapdragon', 'spikeweed', 'threepeater', 'torchwood', 'kernelpult', 'springbean', 'snowpea',
  'chilibean', 'splitpea', 'lightningreed', 'peapod', 'bloomerang', 'starfruit', 'imitater',
  'jalapeno', 'wintermelon', 'twinsunflower', 'marigold', 'spikerock', 'powerlily', 'squash',
  'turnip', 'peach', 'bamboo', 'citron', 'smallcherry', 'doublesamara', 'anthurium',
  'asparagus', 'saucer', 'horsebean', 'groundcherry', 'pineapple', 'electricblueberry',
  'birthsunflower', 'greenturnip', 'endurian', 'pumpkinwitch', 'sunpod', 'goldleaf', 'sungun',
  'akee', 'redstinger', 'stallia', 'cottonyeti', 'agave', 'lavaguava', 'toadstool',
  'jackfruit', 'kiwifruit', 'wintersweet', 'pinkstarfruit',
]);

/**
 * China build: TypeName → on-disk plant1/plant2 folder name, for the (currently none known)
 * cases where they diverge. Defaults to the TypeName itself - see
 * getChinaPlantResourceName() in core/resources/plantTypes.ts. Add entries here the same way
 * PLANT_NAME_MAP (below) documents divergences for the international build, if a China pack is
 * ever found where a plant1/plant2 folder name doesn't match its TypeName exactly.
 */


export function getPlantResourceName(name: string): string {
  return PLANT_NAME_MAP[name] || name;
}

