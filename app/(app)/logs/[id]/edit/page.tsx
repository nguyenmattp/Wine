import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { WineLogWithWine } from "@/lib/types/database";
import { updateWineLog, deleteWineLog } from "../../actions";

export default async function EditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: log } = await supabase
    .from("wine_logs")
    .select("*, wine:wines(*, producer:producers(*))")
    .eq("id", id)
    .single<WineLogWithWine>();

  if (!log) {
    notFound();
  }

  const updateWithId = updateWineLog.bind(null, id);
  const deleteWithId = deleteWineLog.bind(null, id);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">
        {log.wine.name}
        {log.wine.vintage ? ` (${log.wine.vintage})` : " (NV)"}
      </h1>
      <p className="mb-6 text-sm text-neutral-600">{log.wine.producer.name}</p>

      {error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <form action={updateWithId} className="flex flex-col gap-4">
        <div className="flex gap-4">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="bucket"
              value="liked"
              defaultChecked={log.bucket === "liked"}
            />{" "}
            Liked
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="bucket"
              value="fine"
              defaultChecked={log.bucket === "fine"}
            />{" "}
            Fine
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="bucket"
              value="disliked"
              defaultChecked={log.bucket === "disliked"}
            />{" "}
            Disliked
          </label>
        </div>
        <input
          name="tasted_at"
          type="date"
          defaultValue={log.tasted_at}
          className="rounded border px-3 py-2"
        />
        <textarea
          name="notes"
          defaultValue={log.notes ?? ""}
          className="rounded border px-3 py-2"
        />
        <select
          name="visibility"
          defaultValue={log.visibility}
          className="rounded border px-3 py-2"
        >
          <option value="default">Default (follow account privacy)</option>
          <option value="public">Always public</option>
          <option value="private">Always private</option>
        </select>
        <button
          type="submit"
          className="rounded bg-wine-700 hover:bg-wine-800 px-3 py-2 text-white"
        >
          Save changes
        </button>
      </form>

      <form action={deleteWithId} className="mt-4">
        <button type="submit" className="text-sm text-red-700 underline">
          Delete this log
        </button>
      </form>
    </div>
  );
}
