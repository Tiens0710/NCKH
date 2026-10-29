import type { DemoTrack } from "./public-demo";

const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
const COLORS: Record<string, string> = { trang: "white", white: "white", den: "black", black: "black", toi: "black",
  xam: "gray", ghi: "gray", gray: "gray", grey: "gray", do: "red", red: "red", cam: "orange", orange: "orange",
  nau: "brown", brown: "brown", vang: "yellow", yellow: "yellow", luc: "green", green: "green", blue: "blue",
  tim: "purple", purple: "purple", hong: "pink", pink: "pink" };
const STOP = new Set(["tim", "kiem", "nguoi", "ng", "mac", "mau", "va", "voi", "co", "la", "cho", "toi", "person", "wearing", "and"]);

export function queryTerms(query: string): string[] {
  const words = normalize(query).replace(/^tim (kiem )?(?=nguoi|ng\b|ao\b|quan\b)/, "")
    .replace(/xanh (duong|bien)/g, "blue").replace(/xanh (la cay|la|luc)/g, "green")
    .match(/[a-z0-9]+/g) ?? [];
  const terms: string[] = [];
  let part = "";
  for (const word of words) {
    if (["ao", "upper", "shirt"].includes(word)) { part = "upper"; continue; }
    if (["quan", "vay", "lower", "pants", "skirt"].includes(word)) { part = "lower"; continue; }
    if (COLORS[word]) { terms.push(part ? `${part}_${COLORS[word]}` : COLORS[word]); part = ""; }
    else if (!STOP.has(word)) terms.push(word);
  }
  return [...new Set(terms)];
}

function documentTerms(track: DemoTrack): string[] {
  const upper = track.clothing_colors?.upper?.name, lower = track.clothing_colors?.lower?.name;
  return [upper && upper !== "unknown" ? `upper_${upper} ${upper}` : "",
    lower && lower !== "unknown" ? `lower_${lower} ${lower}` : "",
    normalize(track.camera_id), `l${track.local_track_id}`].join(" ").split(/\s+/).filter(Boolean);
}

/** BM25 (k1=1.2, b=.75), with AND constraints so a conflicting outfit is not returned. */
export function searchPeople(tracks: DemoTrack[], query: string): { track: DemoTrack; score: number }[] {
  const terms = queryTerms(query);
  if (!query.trim()) return tracks.map(track => ({ track, score: 0 }));
  if (!terms.length) return [];
  const docs = tracks.map(documentTerms);
  const average = docs.reduce((sum, doc) => sum + doc.length, 0) / (docs.length || 1) || 1;
  const frequencies = new Map(terms.map(term => [term, docs.filter(doc => doc.includes(term)).length]));
  return tracks.flatMap((track, index) => {
    const doc = docs[index];
    if (!terms.every(term => doc.includes(term))) return [];
    const score = terms.reduce((sum, term) => {
      const frequency = doc.filter(token => token === term).length;
      const df = frequencies.get(term)!;
      const idf = Math.log(1 + (docs.length - df + .5) / (df + .5));
      return sum + idf * frequency * 2.2 / (frequency + 1.2 * (.25 + .75 * doc.length / average));
    }, 0);
    return [{ track, score }];
  }).sort((a, b) => b.score - a.score || a.track.track_key.localeCompare(b.track.track_key));
}
