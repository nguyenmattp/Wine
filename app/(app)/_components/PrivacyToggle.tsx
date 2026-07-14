"use client";

import { useState, useTransition } from "react";
import { updatePrivacy } from "../actions";

export default function PrivacyToggle({
  initialPrivate,
}: {
  initialPrivate: boolean;
}) {
  const [isPrivate, setIsPrivate] = useState(initialPrivate);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !isPrivate;
    startTransition(async () => {
      const result = await updatePrivacy(next);
      if (result.ok) {
        setIsPrivate(next);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={toggle}
          disabled={pending}
          className="h-4 w-4"
        />
        <span className="text-sm">
          Private account — only accepted followers can see your rankings
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
