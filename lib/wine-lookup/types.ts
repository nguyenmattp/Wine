import type { WineType } from "@/lib/types/database";

// One search hit from a wine-lookup source, normalized so the logging UI and
// the fn_find_or_create_wine dedup path don't care which vendor produced it.
export type WineLookupResult = {
  providerId: string; // vendor-scoped id, e.g. "sampleapis:red:42"
  wineName: string;
  producerName: string;
  vintage: number | null;
  varietal: string[];
  region: string | null;
  country: string | null;
  wineType: WineType | null;
  imageUrl: string | null;
};

// Swappable lookup source. A real paid vendor (Grapeminds, wineapi.io) drops
// in as another implementation of this interface + a case in the factory;
// nothing else in the app changes.
export interface WineLookupProvider {
  readonly id: string;
  search(query: string): Promise<WineLookupResult[]>;
}
