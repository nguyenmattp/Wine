import Link from "next/link";
import Image from "next/image";
import type { Bucket, WineLogWithWine } from "@/lib/types/database";

const BUCKET_ORDER: Bucket[] = ["liked", "fine", "disliked"];
const BUCKET_LABEL: Record<Bucket, string> = {
  liked: "Liked",
  fine: "Fine",
  disliked: "Disliked",
};

// Renders wine logs grouped into Liked/Fine/Disliked sections, each ordered by
// rank_in_bucket (the caller must pass logs already sorted by rank_in_bucket).
// `editable` shows an Edit link (only for the viewer's own list).
export default function RankedList({
  logs,
  editable = false,
}: {
  logs: WineLogWithWine[];
  editable?: boolean;
}) {
  const grouped = BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: logs.filter((log) => log.bucket === bucket),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-8">
      {grouped.map((group) => (
        <section key={group.bucket}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {BUCKET_LABEL[group.bucket]}
          </h2>
          <ul className="flex flex-col gap-3">
            {group.items.map((log, index) => (
              <li key={log.id} className="rounded border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-sm font-semibold text-neutral-400">
                      #{index + 1}
                    </span>
                    {log.photo_url && (
                      <Image
                        src={log.photo_url}
                        alt={log.wine.name}
                        width={48}
                        height={48}
                        className="h-12 w-12 flex-shrink-0 rounded object-cover"
                      />
                    )}
                    <div>
                      <p className="font-medium">
                        {log.wine.name}
                        {log.wine.vintage ? ` (${log.wine.vintage})` : " (NV)"}
                      </p>
                      <p className="text-sm text-neutral-600">
                        {log.wine.producer.name}
                        {log.wine.region ? ` — ${log.wine.region}` : ""}
                      </p>
                      {log.wine.varietal.length > 0 && (
                        <p className="text-sm text-neutral-500">
                          {log.wine.varietal.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xl font-semibold text-wine-700">{log.score}</p>
                </div>
                {log.notes && <p className="mt-2 text-sm">{log.notes}</p>}
                {editable && (
                  <div className="mt-3">
                    <Link
                      href={`/logs/${log.id}/edit`}
                      className="text-sm text-neutral-600 underline"
                    >
                      Edit
                    </Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
