## 这里只给出最简结构
```cpp
enum class MapEventType
{
    none      = 0,
    level     = 1,
    plantbox  = 2,
    plant     = 3,
    upgrade   = 4,
    powerup   = 5,
    star_gate = 6,
    key_gate  = 7,
    path_node = 8,
    island    = 9,
    doodad    = 10,
    giftbox   = 11,
    pinata    = 12
};
enum class WorldMapEventStatus
{
    undiscovered = 0,
    locked       = 1,
    unlocked     = 2,
    cleared      = 3,

};

enum class LevelNodeType
{
    normal   = 0,
    minigame = 1,
    miniboss = 2,
    boss     = 3,

};

enum class MapTutorialState
{
    none                  = 0,
    map_intro             = 1,
    almanac_intro         = 2,
    continue_egypt        = 3,
    keygate_intro         = 4,    // old only
    challenge_intro       = 7,
    after_challenge       = 8,    // old only
    store_intro           = 9,
    stargate_intro        = 10,   // old only
    stargate_pirate_intro = 11,   // old only 
    zomboss_intro         = 12,   // old only
    quest_intro           = 17,   // new only
    questlog              = 18,   // new only
    elder_quest_intro     = 19,   // new only
    elder_almanac_intro   = 20,   // new only
    elder_almanac_outro   = 21,   // new only
    elder_store_intro     = 22,   // new only
    elder_store_outro     = 23,   // new only
};

struct MapEventItem
{
    Sexy::SexyVector2 m_position;
    std::uint16_t m_imageID;
    MapEventType m_eventType;
    std::string m_name;
    std::string m_toggleName;     // new only
    std::string m_dataString;
    std::string m_unlockedFrom;
    std::string m_visibleFrom;
    std::string m_parentEvent;
    std::string m_displayText;
    std::uint32_t m_cost;          // old only
    bool m_autoVisible;
    std::string m_completedNarrationID;
    std::string m_unlockNarrationID; // old only
    MapTutorialState m_worldMapTutorial;
    WorldMapEventStatus m_worldMapTutorialVisibleWhen;
    bool m_isTimedEvent;             // old only
    bool m_isArtFlipped;
    LevelNodeType m_levelNodeType;
    bool m_isChallengeType;          // old only
    std::int8_t m_drawLayer;
    std::int16_t m_rotationAngle;
    float m_rotationRate;            // new only
    float m_scaleX;                  // new only
    float m_scaleY;                  // new only
    std::int8_t m_parallaxLayer;     // new only
    std::int8_t m_eventId;
    bool m_inheritAssetFilter;       // new only
};

struct WorldData
{
    std::vector<MapEventItem> m_mapPieces;
    std::vector<MapEventItem> m_eventList;
    std::string m_worldName;
    std::uint64_t m_creationTime;
    std::uint16_t m_resGroupID;
    Sexy::Rect m_boundingRect;
    std::uint8_t m_worldId;
};
