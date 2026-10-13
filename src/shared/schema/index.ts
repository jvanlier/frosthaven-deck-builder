import { z } from "zod";

export const MAX_IDENTIFIER_LENGTH = 100;
export const MAX_NOTE_LENGTH = 20_000;
export const MAX_OPERATION_ENTRIES = 100;
export const MAX_DOCUMENT_BYTES = 1_048_576;

export const identifierSchema = z.string().min(1).max(MAX_IDENTIFIER_LENGTH);
export const cardIdSchema = identifierSchema;
export const levelSchema = z.number().int().min(1).max(9);
const revisionSchema = z.number().int().nonnegative().safe();
export const noteTextSchema = z.string().max(MAX_NOTE_LENGTH);
const timestampSchema = z.iso
  .datetime({ offset: true })
  .refine(isRealIsoTimestamp, "Invalid calendar date");

const pickSchema = z
  .object({
    forLevel: levelSchema,
    cardId: cardIdSchema.nullable(),
  })
  .strict();

const levelUpSchema = z
  .object({
    level: levelSchema,
    pick: cardIdSchema.nullable(),
    added: z.array(cardIdSchema).max(MAX_OPERATION_ENTRIES),
    dropped: z.array(cardIdSchema).max(MAX_OPERATION_ENTRIES),
  })
  .strict()
  .superRefine((levelUp, context) => {
    addDuplicateIssues(levelUp.added, context, ["added"]);
    addDuplicateIssues(levelUp.dropped, context, ["dropped"]);

    const dropped = new Set(levelUp.dropped);
    for (const [index, cardId] of levelUp.added.entries()) {
      if (dropped.has(cardId)) {
        context.addIssue({
          code: "custom",
          path: ["added", index],
          message: "A card cannot be both added and dropped at one level",
        });
      }
    }
  });

const noteSchema = z
  .object({
    text: noteTextSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const buildNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_IDENTIFIER_LENGTH);

export const motivationKindSchema = z.enum(["exclude", "add", "drop"]);
const motivationSchema = z
  .object({
    level: levelSchema,
    cardId: cardIdSchema,
    kind: motivationKindSchema,
    text: noteTextSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const buildSchema = z
  .object({
    id: z.uuid(),
    characterId: identifierSchema,
    name: buildNameSchema,
    startLevel: levelSchema,
    startPicks: z.array(pickSchema),
    startDeck: z.array(cardIdSchema).max(MAX_OPERATION_ENTRIES),
    levelUps: z.array(levelUpSchema),
    motivations: z.array(motivationSchema),
    guidance: z.record(identifierSchema, noteSchema),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((build, context) => {
    addDuplicateIssues(build.startDeck, context, ["startDeck"]);

    const expectedPickLevels = Array.from(
      { length: build.startLevel - 1 },
      (_, index) => index + 2,
    );
    if (
      build.startPicks.length !== expectedPickLevels.length ||
      build.startPicks.some(
        (pick, index) => pick.forLevel !== expectedPickLevels[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["startPicks"],
        message:
          "Starting picks must contain exactly the sorted slots 2..startLevel",
      });
    }
    addDuplicateIssues(
      build.startPicks.flatMap((pick) =>
        pick.cardId === null ? [] : [pick.cardId],
      ),
      context,
      ["startPicks"],
    );

    const expectedLevelUps = Array.from(
      { length: 9 - build.startLevel },
      (_, index) => build.startLevel + index + 1,
    );
    if (
      build.levelUps.some(
        (levelUp, index) => levelUp.level !== expectedLevelUps[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["levelUps"],
        message:
          "Level-ups must be sorted and contiguous after the start level",
      });
    }

    const motivationKeys = new Set<string>();
    for (const [index, motivation] of build.motivations.entries()) {
      const key = motivationKey(
        motivation.level,
        motivation.cardId,
        motivation.kind,
      );
      if (motivationKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["motivations", index],
          message: "Motivation keys must be unique",
        });
      }
      motivationKeys.add(key);
    }
  });

export const appDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: revisionSchema,
    builds: z.array(buildSchema),
  })
  .strict()
  .superRefine((data, context) => {
    const buildIds = data.builds.map((build) => build.id);
    addDuplicateIssues(buildIds, context, ["builds"]);

    const encoded = new TextEncoder().encode(JSON.stringify(data));
    if (encoded.byteLength > MAX_DOCUMENT_BYTES) {
      context.addIssue({
        code: "custom",
        path: [],
        message: `Document must be at most ${MAX_DOCUMENT_BYTES} bytes`,
      });
    }
  });

export const putDataRequestSchema = z
  .object({
    baseRevision: revisionSchema,
    data: appDataSchema,
  })
  .strict()
  .superRefine((request, context) => {
    const encoded = new TextEncoder().encode(JSON.stringify(request));
    if (encoded.byteLength > MAX_DOCUMENT_BYTES) {
      context.addIssue({
        code: "custom",
        path: [],
        message: `Request must be at most ${MAX_DOCUMENT_BYTES} bytes`,
      });
    }
  });

export const putDataResponseSchema = z
  .object({ revision: revisionSchema })
  .strict();

export const conflictResponseSchema = z
  .object({ revision: revisionSchema })
  .strict();

export const errorResponseSchema = z
  .object({ error: z.string().min(1).max(200) })
  .strict();

export type AppData = z.infer<typeof appDataSchema>;
export type Build = z.infer<typeof buildSchema>;
export type Pick = z.infer<typeof pickSchema>;
export type LevelUp = z.infer<typeof levelUpSchema>;
export type Motivation = z.infer<typeof motivationSchema>;
export type MotivationKind = z.infer<typeof motivationKindSchema>;
export type Note = z.infer<typeof noteSchema>;
export type PutDataRequest = z.infer<typeof putDataRequestSchema>;

export function motivationKey(
  level: number,
  cardId: string,
  kind: MotivationKind,
): string {
  return JSON.stringify([level, cardId, kind]);
}

function addDuplicateIssues(
  values: string[],
  context: z.RefinementCtx,
  path: PropertyKey[],
): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        path: [...path, index],
        message: "Values must be unique",
      });
    }
    seen.add(value);
  }
}

function isRealIsoTimestamp(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day >= 1 && day <= daysInMonth[month - 1]!;
}
