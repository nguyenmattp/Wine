import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database";
import FollowButton from "../_components/FollowButton";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let results: Profile[] = [];
  let followingIds = new Set<string>();

  if (query) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", `%${query}%`)
      .neq("id", user?.id ?? "")
      .limit(20)
      .returns<Profile[]>();
    results = data ?? [];

    if (results.length > 0) {
      const { data: follows } = await supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", user?.id ?? "")
        .in(
          "followee_id",
          results.map((p) => p.id)
        );
      followingIds = new Set((follows ?? []).map((f) => f.followee_id));
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Find friends</h1>

      <form method="get" className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by username"
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          type="submit"
          className="rounded bg-wine-700 hover:bg-wine-800 px-4 py-2 text-sm text-white"
        >
          Search
        </button>
      </form>

      {query && results.length === 0 && (
        <p className="text-neutral-600">No users match “{query}”.</p>
      )}

      <ul className="flex flex-col gap-3">
        {results.map((profile) => (
          <li
            key={profile.id}
            className="flex items-center justify-between rounded border p-4"
          >
            <div>
              <Link
                href={`/u/${profile.username}`}
                className="font-medium underline"
              >
                {profile.display_name || profile.username}
              </Link>
              <p className="text-sm text-neutral-600">@{profile.username}</p>
            </div>
            <FollowButton
              followeeId={profile.id}
              initialFollowing={followingIds.has(profile.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
