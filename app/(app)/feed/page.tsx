import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { FeedEntry } from "@/lib/types/database";

const PAGE_SIZE = 20;

const BUCKET_LABEL: Record<string, string> = {
  liked: "liked",
  fine: "thought was fine",
  disliked: "disliked",
};

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const { before } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: follows } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", user?.id ?? "")
    .eq("status", "accepted");

  const followeeIds = (follows ?? []).map((f) => f.followee_id);

  let entries: FeedEntry[] = [];
  if (followeeIds.length > 0) {
    // Fan-out-on-read: pull recent logs from everyone the user follows. RLS
    // filters out anything the viewer isn't allowed to see (private logs).
    let query = supabase
      .from("wine_logs")
      .select(
        "*, wine:wines(*, producer:producers(*)), actor:profiles!wine_logs_user_id_fkey(username, display_name)"
      )
      .in("user_id", followeeIds)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (before) query = query.lt("created_at", before);

    const { data } = await query.returns<FeedEntry[]>();
    entries = data ?? [];
  }

  const oldest = entries.at(-1)?.created_at;
  const hasMore = entries.length === PAGE_SIZE;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Feed</h1>

      {followeeIds.length === 0 && (
        <p className="text-neutral-600">
          You&apos;re not following anyone yet.{" "}
          <Link href="/users" className="underline">
            Find friends
          </Link>{" "}
          to see what they&apos;re drinking.
        </p>
      )}

      {followeeIds.length > 0 && entries.length === 0 && (
        <p className="text-neutral-600">
          Nothing here yet — the people you follow haven&apos;t logged any wines
          you can see.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded border p-4">
            <p className="text-sm text-neutral-600">
              <Link
                href={`/u/${entry.actor?.username ?? ""}`}
                className="font-medium text-neutral-900 underline"
              >
                {entry.actor?.display_name || entry.actor?.username || "Someone"}
              </Link>{" "}
              {BUCKET_LABEL[entry.bucket]}
            </p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {entry.photo_url && (
                  <Image
                    src={entry.photo_url}
                    alt={entry.wine.name}
                    width={48}
                    height={48}
                    className="h-12 w-12 flex-shrink-0 rounded object-cover"
                  />
                )}
                <div>
                  <p className="font-medium">
                    {entry.wine.name}
                    {entry.wine.vintage ? ` (${entry.wine.vintage})` : " (NV)"}
                  </p>
                  <p className="text-sm text-neutral-600">
                    {entry.wine.producer.name}
                    {entry.wine.region ? ` — ${entry.wine.region}` : ""}
                  </p>
                </div>
              </div>
              <p className="text-xl font-semibold text-wine-700">{entry.score}</p>
            </div>
            {entry.notes && <p className="mt-2 text-sm">{entry.notes}</p>}
          </li>
        ))}
      </ul>

      {hasMore && oldest && (
        <div className="mt-6">
          <Link
            href={`/feed?before=${encodeURIComponent(oldest)}`}
            className="text-sm underline text-neutral-600"
          >
            Load older →
          </Link>
        </div>
      )}
    </div>
  );
}
