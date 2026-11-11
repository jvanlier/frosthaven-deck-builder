import {
  characterDefinitions,
  frosthavenCharacters,
  mercenaryCharacters,
} from "../characters";
import {
  SOURCE_REPOSITORY,
  sha256,
  sourceImageBaseUrl,
  sourceMetadataUrl,
} from "./source";
import type { ImportPlan, SourceManifest } from "./types";

const GENERATED_DATA_DIRECTORY = "src/shared/data/characters";

export function createManifest(
  plan: ImportPlan,
  assetBytes: ReadonlyMap<string, Uint8Array>,
  iconSource: string,
  iconBytes: Uint8Array,
): SourceManifest {
  return {
    generatedBy: "scripts/import-cards.ts",
    source: {
      repository: SOURCE_REPOSITORY,
      metadata: {
        url: sourceMetadataUrl(
          plan.sourceRevisions.metadata,
          plan.source.directory,
        ),
        revision: plan.sourceRevisions.metadata,
        sha256: plan.metadataChecksum,
      },
      images: {
        baseUrl: sourceImageBaseUrl(plan.sourceRevisions.images),
        revision: plan.sourceRevisions.images,
      },
    },
    assets: [
      ...plan.cards.map((card) => ({
        id: card.id,
        source: card.sourceImage,
        sha256: sha256(assetBytes.get(card.id) as Uint8Array),
      })),
      {
        id: `${plan.character.id.toLowerCase()}-back`,
        source: plan.back.image,
        sha256: sha256(
          assetBytes.get(
            `${plan.character.id.toLowerCase()}-back`,
          ) as Uint8Array,
        ),
      },
    ],
    icon: { source: iconSource, sha256: sha256(iconBytes) },
  };
}

export function createOutputFiles(
  plan: ImportPlan,
  manifest: SourceManifest,
  assetBytes: ReadonlyMap<string, Uint8Array>,
  iconBytes: Uint8Array,
) {
  return [
    {
      relativePath: `${GENERATED_DATA_DIRECTORY}/${plan.character.id}.json`,
      contents: `${JSON.stringify(plan.character, null, 2)}\n`,
    },
    {
      relativePath: `${GENERATED_DATA_DIRECTORY}/${plan.character.id}-source-manifest.json`,
      contents: `${JSON.stringify(manifest, null, 2)}\n`,
    },
    {
      relativePath: `${GENERATED_DATA_DIRECTORY}/index.ts`,
      contents: createCatalogIndex(),
    },
    ...plan.cards.map((card) => ({
      relativePath: `public/cards/${card.image}`,
      contents: assetBytes.get(card.id) as Uint8Array,
    })),
    {
      relativePath: `public/cards/${plan.character.id}/${plan.back.outputPath}`,
      contents: assetBytes.get(
        `${plan.character.id.toLowerCase()}-back`,
      ) as Uint8Array,
    },
    {
      relativePath: `public/icons/${plan.character.icon}`,
      contents: iconBytes,
    },
  ];
}

function createCatalogIndex(): string {
  return `${characterDefinitions.map(({ id }) => `import ${id} from "./${id}.json" with { type: "json" };`).join("\n")}\nimport type { Character } from "../../character.js";\n\nexport const characterGroups = [\n  {\n    name: "Frosthaven",\n    characters: [\n${frosthavenCharacters.map(({ id }) => `      ${id},`).join("\n")}\n    ] as Character[],\n  },\n  {\n    name: "Mercenary Pack",\n    characters: [${mercenaryCharacters.map(({ id }) => id).join(", ")}] as Character[],\n  },\n];\n\nexport const characters = characterGroups.flatMap((group) => group.characters);\n\nexport function getCharacter(id: string): Character | undefined {\n  return characters.find((character) => character.id === id);\n}\n`;
}
