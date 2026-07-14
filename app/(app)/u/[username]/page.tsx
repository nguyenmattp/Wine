import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, WineLogWithWine } from "@/lib/types/database";
import RankedList from "../../_components/RankedList";
import FollowButton from "../../_components/FollowButton";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle<Profile>();

  if (!profile) {
    notFound();
  }

  const isSelf = user?.id === profile.id;

  // Public follow graph: counts are readable by anyone.
  const [{ count: followers }, { count: following }, myFollow] =
    await Promise.all([
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("followee_id", profile.id),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", profile.id),
      user
        ? supabase
            .from("follows")
            .select("follower_id")
            .eq("follower_id", user.id)
            .eq("followee_id", profile.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const amFollowing = Boolean(myFollow.data);

  // RLS decides which of this user's logs are visible to the viewer. A private
  // account returns zero rows to non-followers.
  const { data: logs } = await supabase
    .from("wine_logs")
    .select("*, wine:wines(*, producer:producers(*))")
    .eq("user_id", profile.id)
    .order("rank_in_bucket", { ascending: true })
    .returns<WineLogWithWine[]>();

  const hiddenPrivate =
    profile.is_private && !isSelf && !amFollowing && (logs?.length ?? 0) === 0;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {profile.display_name || profile.username}
          </h1>
          <p className="text-sm text-neutral-600">@{profile.username}</p>
          <p className="mt-1 text-sm text-neutral-500">
            {followers ?? 0} follower{followers === 1 ? "" : "s"} ·{" "}
            {following ?? 0} following
          </p>
          {profile.bio && <p className="mt-2 text-sm">{profile.bio}</p>}
        </div>
        {!isSelf && user && (
          <FollowButton followeeId={profile.id} initialFollowing={amFollowing} />
        )}
      </div>

      {hiddenPrivate ? (
        <p className="rounded border bg-neutral-50 p-4 text-sm text-neutral-600">
          This account is private. Follow to see their rankings.
        </p>
      ) : (logs?.length ?? 0) === 0 ? (
        <p className="text-neutral-600">No wines ranked yet.</p>
      ) : (
        <RankedList logs={logs ?? []} editable={isSelf} />
      )}
    </div>
  );
}
