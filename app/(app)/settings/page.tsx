import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database";
import PrivacyToggle from "../_components/PrivacyToggle";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <div className="mb-6">
        <p className="text-sm text-neutral-600">Signed in as</p>
        <p className="font-medium">@{profile?.username}</p>
      </div>
      <div className="rounded border p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Privacy
        </h2>
        <PrivacyToggle initialPrivate={profile?.is_private ?? false} />
      </div>
    </div>
  );
}
