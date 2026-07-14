"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function followUser(followeeId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (user.id === followeeId) return { ok: false, error: "You can't follow yourself" };

  // upsert so a duplicate follow is a no-op rather than a PK error.
  const { error } = await supabase
    .from("follows")
    .upsert(
      { follower_id: user.id, followee_id: followeeId, status: "accepted" },
      { onConflict: "follower_id,followee_id" }
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/feed");
  revalidatePath("/users");
  return { ok: true };
}

export async function unfollowUser(followeeId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followee_id", followeeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/feed");
  revalidatePath("/users");
  return { ok: true };
}

export async function updatePrivacy(isPrivate: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("profiles")
    .update({ is_private: isPrivate })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
