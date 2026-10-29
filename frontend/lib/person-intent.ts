import type { DemoTrack } from "./public-demo";

export const SEARCH_COLORS = ["black", "white", "gray", "red", "orange", "brown", "yellow", "green", "blue", "purple", "pink"] as const;
export type SearchColor = typeof SEARCH_COLORS[number];
export type OutfitFilter = { upper: SearchColor[]; lower: SearchColor[]; exclude_upper: SearchColor[]; exclude_lower: SearchColor[] };
export type PersonIntent = { status: "ok" | "clarify" | "unsupported"; message: string; alternatives: OutfitFilter[] };

/** Treat model output as untrusted: never silently broaden invalid or empty filters. */
export function validateIntent(value: unknown): PersonIntent {
  if (!value || typeof value !== "object") throw new Error("Invalid search intent");
  const intent = value as PersonIntent;
  if (!["ok", "clarify", "unsupported"].includes(intent.status) || typeof intent.message !== "string" || intent.message.length > 240
    || !Array.isArray(intent.alternatives) || intent.alternatives.length > 4) throw new Error("Invalid search intent");
  for (const filter of intent.alternatives) {
    if (!filter || typeof filter !== "object") throw new Error("Invalid search filter");
    for (const part of ["upper", "lower", "exclude_upper", "exclude_lower"] as const) {
      if (!Array.isArray(filter[part]) || filter[part].length > SEARCH_COLORS.length
        || filter[part].some(color => !SEARCH_COLORS.includes(color))) throw new Error("Invalid color");
    }
    if (![filter.upper, filter.lower, filter.exclude_upper, filter.exclude_lower].some(value => value.length)) throw new Error("Empty search filter");
    if (filter.upper.some(color => filter.exclude_upper.includes(color)) || filter.lower.some(color => filter.exclude_lower.includes(color)))
      throw new Error("Contradictory search filter");
  }
  if (intent.status === "ok" && intent.alternatives.length === 0) throw new Error("Empty search intent");
  if (intent.status !== "ok" && intent.alternatives.length !== 0) throw new Error("Unsupported partial search");
  return intent;
}

export function filterPeopleByIntent(tracks: DemoTrack[], intent: PersonIntent): DemoTrack[] {
  if (intent.status !== "ok") return [];
  const match = (color: string | undefined, include: string[], exclude: string[]) => {
    if (!include.length && !exclude.length) return true;
    if (!color || color === "unknown") return false;
    return (!include.length || include.includes(color)) && !exclude.includes(color);
  };
  return tracks.filter(track => intent.alternatives.some(filter =>
    match(track.clothing_colors?.upper?.name, filter.upper, filter.exclude_upper)
    && match(track.clothing_colors?.lower?.name, filter.lower, filter.exclude_lower)));
}
