"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  prepareWineLog,
  finalizeWineLog,
  searchWines,
  type NewLogInput,
  type ComparisonCandidate,
} from "../actions";
import { createClient } from "@/lib/supabase/client";
import type { Bucket, Visibility, WineType } from "@/lib/types/database";
import type { WineLookupResult } from "@/lib/wine-lookup/types";

type Step = "details" | "comparing" | "saving";

function label(wineName: string, vintage: number | null) {
  return `${wineName}${vintage ? ` (${vintage})` : " (NV)"}`;
}

export default function NewLogFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [error, setError] = useState<string | null>(null);

  // Carried from the details form into the comparison phase.
  const [input, setInput] = useState<NewLogInput | null>(null);
  const [clientLogId, setClientLogId] = useState<string>("");
  const [wineId, setWineId] = useState<string>("");
  const [candidates, setCandidates] = useState<ComparisonCandidate[]>([]);

  // Binary-insertion-sort bounds over the sorted (best-first) candidate list.
  const [lo, setLo] = useState(0);
  const [hi, setHi] = useState(0);

  // Wine lookup / autofill.
  const formRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WineLookupResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const mid = Math.floor((lo + hi) / 2);

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearched(false);
    setResults(await searchWines(q));
    setSearched(true);
    setSearching(false);
  }

  // Pre-fill the (uncontrolled) form from a lookup hit. Everything stays
  // editable; fields the source doesn't provide (varietal, your take) are left
  // untouched.
  function fillFromResult(r: WineLookupResult) {
    const form = formRef.current;
    if (!form) return;
    const set = (name: string, value: string) => {
      const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[name="${name}"]`
      );
      if (el) el.value = value;
    };
    set("wine_name", r.wineName);
    set("vintage", r.vintage ? String(r.vintage) : "");
    set("wine_type", r.wineType ?? "");
    set("region", r.region ?? "");
    set("country", r.country ?? "");
    set("producer_name", r.producerName);
    setResults([]);
    setSearched(false);
    setQuery("");
  }

  function readForm(form: HTMLFormElement): NewLogInput {
    const fd = new FormData(form);
    const str = (k: string) => {
      const v = (fd.get(k) as string | null)?.trim();
      return v ? v : null;
    };
    return {
      producerName: str("producer_name") ?? "",
      producerRegion: str("producer_region"),
      producerCountry: str("producer_country"),
      wineName: str("wine_name") ?? "",
      vintage: str("vintage") ? Number(str("vintage")) : null,
      varietal: (str("varietal") ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      wineType: (str("wine_type") as WineType | null) ?? null,
      region: str("region"),
      country: str("country"),
      bucket: (fd.get("bucket") as Bucket) ?? ("liked" as Bucket),
      notes: str("notes"),
      tastedAt: str("tasted_at"),
      visibility: "default" as Visibility,
      photoUrl: null,
    };
  }

  // Uploads the chosen photo (if any) to the user's own folder in the
  // wine-photos bucket and returns its public URL. Returns undefined on
  // failure so the caller can surface an error and stay on the form.
  async function uploadPhoto(form: HTMLFormElement): Promise<string | null | undefined> {
    const file = form.querySelector<HTMLInputElement>('input[name="photo"]')
      ?.files?.[0];
    if (!file) return null;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return undefined;

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("wine-photos")
      .upload(path, file, { upsert: false });
    if (upErr) return undefined;

    return supabase.storage.from("wine-photos").getPublicUrl(path).data.publicUrl;
  }

  async function onDetailsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const parsed = readForm(form);
    if (!parsed.producerName || !parsed.wineName || !parsed.bucket) {
      setError("Wine name, producer, and a Liked/Fine/Disliked pick are required.");
      return;
    }

    const id = crypto.randomUUID();
    setStep("saving");

    const uploaded = await uploadPhoto(form);
    if (uploaded === undefined) {
      setError("Photo upload failed. Try a different image or remove it.");
      setStep("details");
      return;
    }
    parsed.photoUrl = uploaded;

    setInput(parsed);
    setClientLogId(id);

    const result = await prepareWineLog(parsed, id);
    if (result.status === "error") {
      setError(result.message);
      setStep("details");
      return;
    }
    if (result.status === "done") {
      router.push("/logs");
      router.refresh();
      return;
    }

    setWineId(result.wineId);
    setCandidates(result.candidates);
    setLo(0);
    setHi(result.candidates.length - 1);
    setStep("comparing");
  }

  async function finish(position: number, currentInput: NewLogInput) {
    setStep("saving");
    const prevLogId = position > 0 ? candidates[position - 1].id : null;
    const nextLogId =
      position < candidates.length ? candidates[position].id : null;

    const result = await finalizeWineLog({
      wineId,
      bucket: currentInput.bucket,
      prevLogId,
      nextLogId,
      notes: currentInput.notes,
      tastedAt: currentInput.tastedAt,
      visibility: currentInput.visibility,
      photoUrl: currentInput.photoUrl,
      clientLogId,
    });

    if (result.status === "error") {
      setError(result.message);
      setStep("comparing");
      return;
    }
    router.push("/logs");
    router.refresh();
  }

  function answer(choice: "new" | "existing" | "tie") {
    if (!input) return;

    // Tie: drop the new wine directly below the compared wine and stop.
    if (choice === "tie") {
      void finish(mid + 1, input);
      return;
    }

    // "new" better -> search the better half (lower indices); "existing"
    // better -> search the worse half. lo ends up as the insertion index.
    const nextLo = choice === "existing" ? mid + 1 : lo;
    const nextHi = choice === "new" ? mid - 1 : hi;

    if (nextLo > nextHi) {
      void finish(nextLo, input);
      return;
    }
    setLo(nextLo);
    setHi(nextHi);
  }

  if (step === "comparing" && input) {
    const other = candidates[mid];
    const remaining = Math.max(1, Math.floor(Math.log2(hi - lo + 1)) + 1);
    return (
      <div>
        <h1 className="mb-2 text-2xl font-semibold">Which was better?</h1>
        <p className="mb-6 text-sm text-neutral-600">
          Ranking against your other {input.bucket} wines. ~{remaining} question
          {remaining === 1 ? "" : "s"} left.
        </p>
        {error && (
          <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={() => answer("new")}
            className="rounded border-2 border-neutral-900 p-6 text-left hover:bg-neutral-50"
          >
            <p className="text-xs uppercase text-neutral-500">This one (new)</p>
            <p className="mt-1 font-medium">
              {label(input.wineName, input.vintage)}
            </p>
            <p className="text-sm text-neutral-600">{input.producerName}</p>
          </button>
          <button
            onClick={() => answer("existing")}
            className="rounded border-2 border-neutral-900 p-6 text-left hover:bg-neutral-50"
          >
            <p className="text-xs uppercase text-neutral-500">Already ranked</p>
            <p className="mt-1 font-medium">
              {label(other.wineName, other.vintage)}
            </p>
            <p className="text-sm text-neutral-600">{other.producerName}</p>
          </button>
        </div>
        <button
          onClick={() => answer("tie")}
          className="mt-4 w-full rounded border px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          Too close to call
        </button>
      </div>
    );
  }

  if (step === "saving") {
    return <p className="text-neutral-600">Saving…</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Log a wine</h1>
      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      <p className="mb-4 text-sm text-neutral-600">
        Search to autofill from the wine directory, or just fill it in manually.
        Everything stays editable.
      </p>

      <div className="mb-6 rounded border p-4">
        <label className="text-sm font-medium">Search to autofill</label>
        <div className="mt-2 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Search wines (e.g. Cabernet, Rioja)"
            className="flex-1 rounded border px-3 py-2"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={searching || query.trim().length < 2}
            className="rounded bg-wine-700 hover:bg-wine-800 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {searched && results.length === 0 && (
          <p className="mt-3 text-sm text-neutral-600">
            No matches — just fill in the form below manually.
          </p>
        )}
        {results.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {results.map((r) => (
              <li key={r.providerId}>
                <button
                  type="button"
                  onClick={() => fillFromResult(r)}
                  className="w-full rounded border p-3 text-left hover:bg-neutral-50"
                >
                  <p className="font-medium">{label(r.wineName, r.vintage)}</p>
                  <p className="text-sm text-neutral-600">
                    {r.producerName}
                    {r.region ? ` — ${r.region}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form ref={formRef} onSubmit={onDetailsSubmit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-3 rounded border p-4">
          <legend className="px-1 text-sm font-medium">Wine</legend>
          <input
            name="wine_name"
            placeholder="Wine name (e.g. Reserve Cabernet)"
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="vintage"
            type="number"
            placeholder="Vintage (leave blank for NV)"
            className="rounded border px-3 py-2"
          />
          <input
            name="varietal"
            placeholder="Varietal(s), comma-separated"
            className="rounded border px-3 py-2"
          />
          <select
            name="wine_type"
            className="rounded border px-3 py-2"
            defaultValue=""
          >
            <option value="">Wine type</option>
            <option value="red">Red</option>
            <option value="white">White</option>
            <option value="rose">Rosé</option>
            <option value="sparkling">Sparkling</option>
            <option value="dessert">Dessert</option>
            <option value="fortified">Fortified</option>
            <option value="orange">Orange</option>
          </select>
          <input
            name="region"
            placeholder="Region"
            className="rounded border px-3 py-2"
          />
          <input
            name="country"
            placeholder="Country"
            className="rounded border px-3 py-2"
          />
          <div>
            <label className="text-sm text-neutral-600">Photo (optional)</label>
            <input
              name="photo"
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm text-neutral-600 file:mr-3 file:rounded file:border-0 file:bg-wine-50 file:px-3 file:py-1.5 file:text-sm file:text-wine-800 hover:file:bg-wine-100"
            />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded border p-4">
          <legend className="px-1 text-sm font-medium">Maker</legend>
          <input
            name="producer_name"
            placeholder="Producer / winery"
            required
            className="rounded border px-3 py-2"
          />
          <input
            name="producer_region"
            placeholder="Producer region (optional, helps dedup)"
            className="rounded border px-3 py-2"
          />
          <input
            name="producer_country"
            placeholder="Producer country"
            className="rounded border px-3 py-2"
          />
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded border p-4">
          <legend className="px-1 text-sm font-medium">Your take</legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-1">
              <input type="radio" name="bucket" value="liked" required /> Liked
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="bucket" value="fine" /> Fine
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="bucket" value="disliked" /> Disliked
            </label>
          </div>
          <input name="tasted_at" type="date" className="rounded border px-3 py-2" />
          <textarea
            name="notes"
            placeholder="Notes (optional)"
            className="rounded border px-3 py-2"
          />
        </fieldset>

        <button
          type="submit"
          className="rounded bg-wine-700 hover:bg-wine-800 px-3 py-2 text-white"
        >
          Next
        </button>
      </form>
    </div>
  );
}
