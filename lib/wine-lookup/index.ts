import type { WineLookupProvider } from "./types";
import { sampleApisProvider } from "./sampleApis";
import { manualProvider } from "./manual";

// Chooses the active lookup source from WINE_LOOKUP_PROVIDER. Add a real
// vendor by writing another WineLookupProvider and a case here; the search
// UI and dedup path are untouched.
export function getWineLookupProvider(): WineLookupProvider {
  switch (process.env.WINE_LOOKUP_PROVIDER) {
    case "manual":
      return manualProvider;
    case "sampleapis":
    default:
      return sampleApisProvider;
  }
}
