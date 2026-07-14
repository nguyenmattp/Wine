"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followUser, unfollowUser } from "../actions";

export default function FollowButton({
  followeeId,
  initialFollowing,
}: {
  followeeId: string;
  initialFollowing: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = following
        ? await unfollowUser(followeeId)
        : await followUser(followeeId);
      if (result.ok) {
        setFollowing(!following);
        router.refresh(); // keep follower counts in sync
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={
        following
          ? "rounded border border-wine-200 px-3 py-1.5 text-sm text-wine-800 hover:bg-wine-50 disabled:opacity-50"
          : "rounded bg-wine-700 px-3 py-1.5 text-sm text-white hover:bg-wine-800 disabled:opacity-50"
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
