import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database";
import { signOut } from "../(auth)/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "username">>();

  return (
    <div>
      <nav className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/logs" className="text-lg font-bold text-wine-800">
          Wine App
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/feed" className="underline">
            Feed
          </Link>
          <Link href="/logs" className="underline">
            My rankings
          </Link>
          <Link href="/users" className="underline">
            Find friends
          </Link>
          <Link href="/logs/new" className="underline">
            Log a wine
          </Link>
          {profile?.username && (
            <Link href={`/u/${profile.username}`} className="underline">
              Profile
            </Link>
          )}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-neutral-600 underline">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main className="mx-auto max-w-2xl px-6 py-8">{children}</main>
    </div>
  );
}
