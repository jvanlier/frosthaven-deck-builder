import {
  mkdtemp,
  readFile,
  rename,
  rm,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { characterDefinitions, snowdancer } from "./characters";
import { createImportPlan } from "./card-import/parse";
import {
  downloadAsset,
  fetchRequired,
  fetchSourceRevisions,
  sha256,
  sourceMetadataUrl,
} from "./card-import/source";
import { createManifest } from "./card-import/outputs";
import { commitOutputs } from "./card-import/install";
import type {
  ImportCardsOptions,
  ImportCardsResult,
  ImportFileSystem,
} from "./card-import/types";

export {
  createImportPlan,
  parseSourceRecords,
  validateCatalog,
} from "./card-import/parse";
export {
  fetchSourceRevisions,
  SOURCE_METADATA_URL,
  SOURCE_IMAGE_BASE_URL,
  SOURCE_REPOSITORY,
  SOURCE_REVISION_URLS,
} from "./card-import/source";
export type {
  SourceCardRecord,
  SourceRevisions,
  ParsedCard,
  ParsedCardBack,
  ParsedSourceRecords,
  ImportPlan,
  SourceManifest,
  FetchImplementation,
  ImportFileSystem,
  ImportCardsOptions,
  ImportCardsResult,
} from "./card-import/types";

const defaultFileSystem: ImportFileSystem = {
  mkdtemp,
  readFile,
  rename,
  rm,
  mkdir,
  writeFile,
};

export async function importCards(
  options: ImportCardsOptions = {},
): Promise<ImportCardsResult> {
  const character = options.character ?? snowdancer;
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const fileSystem = { ...defaultFileSystem, ...options.fileSystem };
  const sourceRevisions =
    options.sourceRevisions ?? (await fetchSourceRevisions(fetchImpl));
  const metadataResponse = await fetchRequired(
    fetchImpl,
    sourceMetadataUrl(sourceRevisions.metadata, character.source.directory),
    "source metadata download",
  );
  const metadataBytes = new Uint8Array(await metadataResponse.arrayBuffer());
  const metadataText = new TextDecoder().decode(metadataBytes);
  let records: unknown;
  try {
    records = JSON.parse(metadataText);
  } catch (error) {
    throw new Error("Source metadata is not valid JSON", { cause: error });
  }
  if (!Array.isArray(records)) {
    throw new Error("Source metadata must be an array");
  }

  const plan = createImportPlan(records, {
    metadataChecksum: sha256(metadataBytes),
    sourceRevisions,
    requireCompleteCatalog: options.requireCompleteCatalog,
    character,
  });
  const assetBytes = new Map<string, Uint8Array>();
  for (const card of plan.cards) {
    assetBytes.set(
      card.id,
      await downloadAsset(
        fetchImpl,
        card.sourceImage,
        card.id,
        sourceRevisions.images,
      ),
    );
  }
  const backId = `${plan.character.id.toLowerCase()}-back`;
  assetBytes.set(
    backId,
    await downloadAsset(
      fetchImpl,
      plan.back.image,
      "card back",
      sourceRevisions.images,
    ),
  );

  const iconSource =
    options.iconSource ??
    `icons/characters/${character.source.iconDirectory}/${character.id}.png`;
  const iconBytes = options.iconSource
    ? new Uint8Array(
        await fileSystem.readFile(
          isAbsolute(iconSource)
            ? iconSource
            : resolve(projectRoot, iconSource),
        ),
      )
    : await downloadAsset(
        fetchImpl,
        iconSource,
        "class icon",
        sourceRevisions.images,
      );
  const manifest = createManifest(plan, assetBytes, iconSource, iconBytes);
  await commitOutputs(
    projectRoot,
    plan,
    manifest,
    assetBytes,
    iconBytes,
    fileSystem,
  );

  return { character: plan.character, manifest };
}

async function main(): Promise<void> {
  const sourceRevisions = await fetchSourceRevisions((input, init) =>
    fetch(input, init),
  );
  for (const character of characterDefinitions) {
    const result = await importCards({ character, sourceRevisions });
    console.log(
      `Imported ${result.character.cards.length} ${character.name} cards, card back, and class icon.`,
    );
  }
}

if (
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "")
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
