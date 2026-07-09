"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";

import { dismissDecision } from "@/app/(app)/command/actions";
import { Button } from "@/components/ui/button";

/** Dismiss one Decision-Queue item; the row hides on the next revalidate (the action revalidates
 *  `/command`). Kept as a small client island so the page itself stays a server component. The
 *  transition awaits the server action so the button stays disabled until it settles, and a
 *  failure message is surfaced on the button instead of being silently dropped. */
export function DecisionDismissButton({ dedupeKey }: { dedupeKey: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="size-8 p-0"
      aria-label="Dismiss"
      title={error ?? undefined}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await dismissDecision(dedupeKey);
          setError(res.ok ? null : res.message);
        })
      }
    >
      <X className="size-4" />
    </Button>
  );
}
