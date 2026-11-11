import type { AppData, Build } from "../shared/schema/index.js";

export function updateBuildData(
  data: AppData,
  buildId: string,
  updater: (build: Build) => Build,
): AppData {
  const build = data.builds.find((candidate) => candidate.id === buildId);
  if (!build) {
    return data;
  }
  const updated = updater(build);
  if (updated === build) {
    return data;
  }
  return {
    ...data,
    builds: data.builds.map((candidate) =>
      candidate.id === updated.id ? updated : candidate,
    ),
  };
}
