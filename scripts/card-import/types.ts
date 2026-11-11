import type * as fs from "node:fs/promises";
import type { Card, Character } from "../../src/shared/character";
import type { CharacterDefinition } from "../characters";

export interface SourceCardRecord {
  name: string;
  expansion: string;
  image: string;
  level: string;
  initiative: string;
}

export interface SourceRevisions {
  metadata: string;
  images: string;
}

export interface ParsedCard extends Card {
  sourceImage: string;
}

export interface ParsedCardBack {
  image: string;
  outputPath: string;
}

export interface ParsedSourceRecords {
  cards: ParsedCard[];
  back?: ParsedCardBack;
}

export interface ImportPlan {
  source: CharacterDefinition["source"];
  character: Character;
  cards: ParsedCard[];
  back: ParsedCardBack;
  metadataChecksum: string;
  sourceRevisions: SourceRevisions;
}

export interface SourceManifest {
  generatedBy: string;
  source: {
    repository: string;
    metadata: {
      url: string;
      revision: string;
      sha256: string;
    };
    images: {
      baseUrl: string;
      revision: string;
    };
  };
  assets: Array<{
    id: string;
    source: string;
    sha256: string;
  }>;
  icon: {
    source: string;
    sha256: string;
  };
}

export type FetchImplementation = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface ImportFileSystem {
  mkdtemp: typeof fs.mkdtemp;
  readFile: typeof fs.readFile;
  rename: typeof fs.rename;
  rm: typeof fs.rm;
  mkdir: typeof fs.mkdir;
  writeFile: typeof fs.writeFile;
}

export interface ImportCardsOptions {
  character?: CharacterDefinition;
  projectRoot?: string;
  iconSource?: string;
  fetchImpl?: FetchImplementation;
  fileSystem?: Partial<ImportFileSystem>;
  requireCompleteCatalog?: boolean;
  sourceRevisions?: SourceRevisions;
}

export interface ImportCardsResult {
  character: Character;
  manifest: SourceManifest;
}
