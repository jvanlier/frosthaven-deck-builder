const frosthavenSource = {
  directory: "frosthaven",
  filePrefix: "fh-",
  iconDirectory: "fh",
} as const;
const mercenarySource = {
  directory: "mercenary",
  filePrefix: "",
  iconDirectory: "merc",
} as const;

export const frosthavenCharacters = (
  [
    { id: "BB", name: "Blinkblade", handSize: 10, levelOneCards: 10 },
    { id: "BN", name: "Banner Spear", handSize: 10, levelOneCards: 10 },
    { id: "BO", name: "Boneshaper", handSize: 12, levelOneCards: 12 },
    { id: "CR", name: "Crashing Tide", handSize: 12, levelOneCards: 12 },
    { id: "DF", name: "Drifter", handSize: 12, levelOneCards: 12 },
    { id: "DT", name: "Deepwraith", handSize: 10, levelOneCards: 10 },
    { id: "DW", name: "Deathwalker", handSize: 11, levelOneCards: 11 },
    { id: "FF", name: "Frozen Fist", handSize: 8, levelOneCards: 8 },
    { id: "GE", name: "Geminate", handSize: 14, levelOneCards: 14 },
    { id: "HV", name: "Hive", handSize: 9, levelOneCards: 11 },
    { id: "IF", name: "Infuser", handSize: 11, levelOneCards: 11 },
    { id: "ME", name: "Metal Mosaic", handSize: 9, levelOneCards: 9 },
    { id: "PC", name: "Pain Conduit", handSize: 10, levelOneCards: 10 },
    { id: "PY", name: "Pyroclast", handSize: 10, levelOneCards: 10 },
    { id: "SD", name: "Snowdancer", handSize: 11, levelOneCards: 11 },
    { id: "SH", name: "Shattersong", handSize: 10, levelOneCards: 10 },
    { id: "TA", name: "Trapper", handSize: 9, levelOneCards: 9 },
  ] as const
).map((character) => ({ ...character, source: frosthavenSource }));

export const mercenaryCharacters = (
  [
    { id: "AN", name: "Anaphi", handSize: 11, levelOneCards: 11 },
    { id: "CA", name: "Cassandra", handSize: 10, levelOneCards: 10 },
    { id: "HA", name: "Hail", handSize: 9, levelOneCards: 9 },
    { id: "SA", name: "Satha", handSize: 10, levelOneCards: 10 },
  ] as const
).map((character) => ({ ...character, source: mercenarySource }));

export const characterDefinitions = [
  ...frosthavenCharacters,
  ...mercenaryCharacters,
];

// Melee-form cards have the pink background in the upstream artwork.
export const geminateMeleeCards = new Set([
  "changelings-boon",
  "drag-down",
  "draining-pincers",
  "flailing-tendrils",
  "hornbeetle-carapace",
  "hornet-stingers",
  "icebound-quills",
  "feeding-frenzy",
  "reckless-jab",
  "venomous-barbs",
  "mandible-storm",
  "thresh-and-flail",
  "formless-grace",
  "corrosive-acids",
  "two-pronged-entrapment",
  "accelerated-metabolism",
  "harbinger-of-ruin",
]);

export type CharacterDefinition = (typeof characterDefinitions)[number];
export const snowdancer = frosthavenCharacters.find(({ id }) => id === "SD")!;
