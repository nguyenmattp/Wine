import type { WineType } from "@/lib/types/database";
import type { WineLookupProvider, WineLookupResult } from "./types";

// SampleAPIs (https://api.sampleapis.com/wines) is free and needs no auth.
// It has no search endpoint, so we fetch each category list (cached for a day)
// and filter in memory. wine_type is implied by the category. varietal isn't
// provided, so it's left for the user to fill.
const CATEGORIES: { path: string; type: WineType }[] = [
  { path: "reds", type: "red" },
  { path: "whites", type: "white" },
  { path: "sparkling", type: "sparkling" },
  { path: "rose", type: "rose" },
  { path: "dessert", type: "dessert" },
  { path: "port", type: "fortified" },
];

type SampleApiWine = {
  id: number;
  winery?: string;
  wine?: string;
  location?: string;
  image?: string;
};

// SampleAPIs bakes the vintage into the wine name ("Emporda 2012"). Pull the
// trailing 4-digit year out into a real vintage and strip it from the name.
function parseVintage(raw: string): { name: string; vintage: number | null } {
  const match = raw.match(/\b(?:19|20)\d{2}\b/);
  if (!match) return { name: raw.trim(), vintage: null };
  const vintage = Number(match[0]);
  const name = raw.replace(match[0], "").replace(/\s{2,}/g, " ").trim();
  return { name: name || raw.trim(), vintage };
}

// location is a "·"-separated string with inconsistent country/region order
// across entries, so collapse it into a single best-effort region string and
// let the user correct it rather than guessing wrong.
function cleanLocation(loc: string | undefined): string | null {
  if (!loc) return null;
  const parts = loc
    .split("·")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export const sampleApisProvider: WineLookupProvider = {
  id: "sampleapis",
  async search(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const lists = await Promise.all(
      CATEGORIES.map(async (cat) => {
        try {
          const res = await fetch(
            `https://api.sampleapis.com/wines/${cat.path}`,
            { next: { revalidate: 86400 } }
          );
          if (!res.ok) return [];
          const data = (await res.json()) as SampleApiWine[];
          return data.map((w) => ({ w, type: cat.type }));
        } catch {
          return [];
        }
      })
    );

    const results: WineLookupResult[] = [];
    for (const { w, type } of lists.flat()) {
      const wineRaw = w.wine ?? "";
      const winery = w.winery ?? "";
      if (
        !wineRaw.toLowerCase().includes(q) &&
        !winery.toLowerCase().includes(q)
      ) {
        continue;
      }
      const { name, vintage } = parseVintage(wineRaw);
      results.push({
        providerId: `sampleapis:${type}:${w.id}`,
        wineName: name,
        producerName: winery,
        vintage,
        varietal: [],
        region: cleanLocation(w.location),
        country: null,
        wineType: type,
        imageUrl: w.image ?? null,
      });
      if (results.length >= 20) break;
    }
    return results;
  },
};
