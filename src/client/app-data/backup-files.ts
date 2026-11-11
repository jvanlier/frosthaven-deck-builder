import {
  appDataSchema,
  MAX_DOCUMENT_BYTES,
  type AppData,
} from "../../shared/schema/index.js";
import { hasSupportedCharacters } from "../../shared/supported-characters.js";

export class ImportDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportDataError";
  }
}

export async function parseImportFile(file: Blob): Promise<AppData> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new ImportDataError("The backup file must be at most 1 MiB.");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw new ImportDataError("The backup file is not valid UTF-8 JSON.");
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ImportDataError("The backup file is not valid JSON.");
  }

  return parseImportData(value);
}

export function parseImportData(value: unknown): AppData {
  const parsed = appDataSchema.safeParse(value);
  if (!parsed.success) {
    throw new ImportDataError("The backup does not match the app data schema.");
  }
  if (!hasSupportedCharacters(parsed.data)) {
    throw new ImportDataError("The backup contains an unsupported character.");
  }
  return parsed.data;
}

export function downloadDocument(data: AppData, filename: string): void {
  const blob = new Blob([JSON.stringify(data)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
