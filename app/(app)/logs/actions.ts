"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Bucket, Visibility, WineType } from "@/lib/types/database";
import { getWineLookupProvider } from "@/lib/wine-lookup";
import type { WineLookupResult } from "@/lib/wine-lookup/types";

// Wine lookup/autofill. Runs the active provider server-side (keeps any future
// API keys off the client) and swallows outages so search failing never blocks
// manual entry.
export async function searchWines(query: string): Promise<WineLookupResult[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    return await getWineLookupProvider().search(query);
  } catch {
    return [];
  }
}

export type NewLogInput = {
  producerName: string;
  producerRegion: string | null;
  producerCountry: string | null;
  wineName: string;
  vintage: number | null;
  varietal: string[];
  wineType: WineType | null;
  region: string | null;
  country: string | null;
  bucket: Bucket;
  notes: string | null;
  tastedAt: string | null;
  visibility: Visibility;
  photoUrl: string | null;
};

// A prior log in the same bucket, used as a comparison candidate. Score is
// deliberately omitted so it can't anchor the user's better/worse judgement.
export type ComparisonCandidate = {
  id: string;
  wineName: string;
  producerName: string;
  vintage: number | null;
};

export type PrepareResult =
  | { status: "error"; message: string }
  | { status: "done" } // empty bucket -> seeded and inserted directly
  | { status: "compare"; wineId: string; candidates: ComparisonCandidate[] };

type BucketLogRow = {
  id: string;
  wine: {
    name: string;
    vintage: number | null;
    producer: { name: string } | null;
  } | null;
};

// Step 1 of logging: resolve/create the canonical wine, then either insert
// immediately (first wine in the bucket) or hand back the ordered comparison
// list so the client can run its binary-insertion-sort.
export async function prepareWineLog(
  input: NewLogInput,
  clientLogId: string
): Promise<PrepareResult> {
  const supabase = await createClient();

  if (!input.producerName || !input.wineName || !input.bucket) {
    return { status: "error", message: "Missing required fields" };
  }

  const { data: wineId, error: wineError } = await supabase.rpc(
    "fn_find_or_create_wine",
    {
      p_producer_name: input.producerName,
      p_producer_region: input.producerRegion,
      p_producer_country: input.producerCountry,
      p_wine_name: input.wineName,
      p_vintage: input.vintage,
      p_varietal: input.varietal,
      p_wine_type: input.wineType,
      p_region: input.region,
      p_country: input.country,
    }
  );

  if (wineError || !wineId) {
    return {
      status: "error",
      message: wineError?.message ?? "Could not save wine",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Not signed in" };
  }

  // Explicit owner filter (defense in depth) so the comparison list stays the
  // caller's own logs even if wine_logs RLS is widened for social features.
  const { data: existing, error: listError } = await supabase
    .from("wine_logs")
    .select("id, wine:wines(name, vintage, producer:producers(name))")
    .eq("user_id", user.id)
    .eq("bucket", input.bucket)
    .order("rank_in_bucket", { ascending: true })
    .returns<BucketLogRow[]>();

  if (listError) {
    return { status: "error", message: listError.message };
  }

  if (!existing || existing.length === 0) {
    const { error: insertError } = await supabase.rpc("fn_insert_wine_log", {
      p_wine_id: wineId,
      p_bucket: input.bucket,
      p_prev_log_id: null,
      p_next_log_id: null,
      p_notes: input.notes,
      p_photo_url: input.photoUrl,
      p_visibility: input.visibility,
      p_tasted_at: input.tastedAt,
      p_client_log_id: clientLogId,
    });
    if (insertError) {
      return { status: "error", message: insertError.message };
    }
    revalidatePath("/logs");
    return { status: "done" };
  }

  return {
    status: "compare",
    wineId,
    candidates: existing.map((row) => ({
      id: row.id,
      wineName: row.wine?.name ?? "Unknown wine",
      producerName: row.wine?.producer?.name ?? "Unknown producer",
      vintage: row.wine?.vintage ?? null,
    })),
  };
}

// Step 2 of logging: the client has resolved the insertion position to its
// two neighbors; persist through the ranking function (which re-validates the
// neighbors under an advisory lock and computes the final score/rank).
export async function finalizeWineLog(args: {
  wineId: string;
  bucket: Bucket;
  prevLogId: string | null;
  nextLogId: string | null;
  notes: string | null;
  tastedAt: string | null;
  visibility: Visibility;
  photoUrl: string | null;
  clientLogId: string;
}): Promise<{ status: "ok" } | { status: "error"; message: string }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("fn_insert_wine_log", {
    p_wine_id: args.wineId,
    p_bucket: args.bucket,
    p_prev_log_id: args.prevLogId,
    p_next_log_id: args.nextLogId,
    p_notes: args.notes,
    p_photo_url: args.photoUrl,
    p_visibility: args.visibility,
    p_tasted_at: args.tastedAt,
    p_client_log_id: args.clientLogId,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/logs");
  return { status: "ok" };
}

export async function updateWineLog(logId: string, formData: FormData) {
  const supabase = await createClient();

  const bucket = formData.get("bucket") as Bucket;
  const notes = (formData.get("notes") as string) || null;
  const tastedAt = (formData.get("tasted_at") as string) || null;
  const visibility = (formData.get("visibility") as Visibility) || "default";

  // All wine_logs writes go through SECURITY DEFINER functions -- direct
  // INSERT/UPDATE grants are revoked so clients can't tamper with score or
  // rank_in_bucket. Bucket changes re-seed the score inside the function
  // (Phase 1 stub semantics; the Phase 2 comparison flow replaces this).
  // Editing the underlying wine identity (producer/vintage/varietal) isn't
  // supported here -- that goes through the lookup/manual entry flow in
  // Phase 3 instead.
  const { error } = await supabase.rpc("fn_update_wine_log", {
    p_log_id: logId,
    p_bucket: bucket,
    p_notes: notes,
    p_tasted_at: tastedAt,
    p_visibility: visibility,
  });

  if (error) {
    redirect(`/logs/${logId}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/logs");
  redirect("/logs");
}

export async function deleteWineLog(logId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("wine_logs").delete().eq("id", logId);
  if (error) {
    redirect(`/logs/${logId}/edit?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/logs");
  redirect("/logs");
}
