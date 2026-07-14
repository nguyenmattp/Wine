import type { WineLookupProvider } from "./types";

// First-class "no external source" provider: search returns nothing, so the
// logging UI cleanly falls back to manual entry. Used when
// WINE_LOOKUP_PROVIDER=manual or as the safe default if a vendor is removed.
export const manualProvider: WineLookupProvider = {
  id: "manual",
  async search() {
    return [];
  },
};
