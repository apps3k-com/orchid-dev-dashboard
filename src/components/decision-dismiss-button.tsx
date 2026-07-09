"use client";

import { useTransition } from "react";
import { X } from "lucide-react";

import { dismissDecision } from "@/app/(app)/command/actions";
import { Button } from "@/components/ui/button";

/** Dismiss one Decision-Queue item; the row hides on the next revalidate (the action revalidates
 *  `/command`). Kept as a small client island so the page itself stays a server component. */
export function DecisionDismissButton({ dedupeKey }: { dedupeKey: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="size-8 p-0"
      aria-label="Dismiss"
      disabled={pending}
      onClick={() => startTransition(() => void dismissDecision(dedupeKey))}
    >
      <X className="size-4" />
    </Button>
  );
}
