import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { WineLogWithWine } from "@/lib/types/database";
import RankedList from "../_components/RankedList";

export default async function LogsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Order is the source of truth: sort by rank_in_bucket, never by score
  // alone. The explicit user filter keeps this to the caller's own logs even
  // though wine_logs SELECT RLS is now widened for social viewing.
  const { data: logs, error } = await supabase
    .from("wine_logs")
    .select("*, wine:wines(*, producer:producers(*))")
    .eq("user_id", user?.id ?? "")
    .order("rank_in_bucket", { ascending: true })
    .returns<WineLogWithWine[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My rankings</h1>
        <Link
          href="/logs/new"
          className="rounded bg-wine-700 hover:bg-wine-800 px-3 py-2 text-sm text-white"
        >
          Log a wine
        </Link>
      </div>

      {error && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
      )}

      {!error && (logs?.length ?? 0) === 0 && (
        <p className="text-neutral-600">
          No wines logged yet.{" "}
          <Link href="/logs/new" className="underline">
            Log your first one
          </Link>
          .
        </p>
      )}

      <RankedList logs={logs ?? []} editable />
    </div>
  );
}
