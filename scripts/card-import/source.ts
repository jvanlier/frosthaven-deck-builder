import { createHash } from "node:crypto";
import type { FetchImplementation, SourceRevisions } from "./types";

const RAW_REPOSITORY_URL =
  "https://raw.githubusercontent.com/cmlenius/gloomhaven-card-browser";
const SOURCE_METADATA_DIRECTORY = "data/character-abilities";
const SOURCE_IMAGE_PATH = "images/";
export const SOURCE_METADATA_URL = `${RAW_REPOSITORY_URL}/main/${SOURCE_METADATA_DIRECTORY}/frosthaven.json`;
export const SOURCE_IMAGE_BASE_URL = `${RAW_REPOSITORY_URL}/images/${SOURCE_IMAGE_PATH}`;
export const SOURCE_REPOSITORY =
  "https://github.com/cmlenius/gloomhaven-card-browser";
export const SOURCE_REVISION_URLS = {
  metadata:
    "https://api.github.com/repos/cmlenius/gloomhaven-card-browser/commits/main",
  images:
    "https://api.github.com/repos/cmlenius/gloomhaven-card-browser/commits/images",
} as const;

export async function fetchSourceRevisions(
  fetchImpl: FetchImplementation,
): Promise<SourceRevisions> {
  const [metadataResponse, imagesResponse] = await Promise.all([
    fetchRequired(
      fetchImpl,
      SOURCE_REVISION_URLS.metadata,
      "metadata revision",
    ),
    fetchRequired(fetchImpl, SOURCE_REVISION_URLS.images, "image revision"),
  ]);
  const [metadata, images] = await Promise.all([
    readRevision(metadataResponse),
    readRevision(imagesResponse),
  ]);
  return { metadata, images };
}

export async function fetchRequired(
  fetchImpl: FetchImplementation,
  url: string,
  description: string,
): Promise<Response> {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed ${description}: HTTP ${response.status}`);
  }
  return response;
}

async function readRevision(response: Response): Promise<string> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error("Source revision response is not valid JSON", {
      cause: error,
    });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("sha" in body) ||
    typeof body.sha !== "string" ||
    !/^[a-f0-9]{40}$/.test(body.sha)
  ) {
    throw new Error("Source revision response did not contain a commit SHA");
  }
  return body.sha;
}

export function sourceMetadataUrl(revision: string, directory: string): string {
  return `${RAW_REPOSITORY_URL}/${revision}/${SOURCE_METADATA_DIRECTORY}/${directory}.json`;
}

export function sourceImageBaseUrl(revision: string): string {
  return `${RAW_REPOSITORY_URL}/${revision}/${SOURCE_IMAGE_PATH}`;
}

export async function downloadAsset(
  fetchImpl: FetchImplementation,
  sourceImage: string,
  label: string,
  revision: string,
): Promise<Uint8Array> {
  const url = new URL(sourceImage, sourceImageBaseUrl(revision)).toString();
  const response = await fetchRequired(fetchImpl, url, `${label} download`);
  return new Uint8Array(await response.arrayBuffer());
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
