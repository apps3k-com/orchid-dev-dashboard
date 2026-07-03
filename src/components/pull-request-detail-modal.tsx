"use client";

import { useEffect, useState } from "react";

import {
  ArrowUpRight,
  CircleCheck,
  CircleDot,
  CircleX,
  Eye,
  GitCommitHorizontal,
  GitMerge,
  MessageSquare,
  Tag,
} from "lucide-react";

import { getPullTimeline } from "@/app/(app)/pulls/actions";
import type { PullRow } from "@/components/pulls-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Timeline,
  TimelineContent,
  TimelineDot,
  TimelineHeading,
  TimelineItem,
  TimelineLine,
} from "@/components/ui/timeline";
import type {
  PullTimeline,
  PullTimelineEntry,
  PullTimelineHeader,
} from "@/server/github/pull-timeline";

/** Centered modal showing a pull request's live timeline (comments, reviews, commits, label/state
 *  events). Opens when `pull` is non-null; loads the timeline lazily on open via a server action. */
export function PullRequestDetailModal({
  pull,
  onOpenChange,
}: {
  pull: PullRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  // Keyed by the PR id so loading/timeline can be *derived* during render (no synchronous setState
  // in the effect): while the loaded result is for a different PR than the open one, we're loading.
  const pullId = pull?.id ?? null;
  const [result, setResult] = useState<{ id: string; data: PullTimeline | null } | null>(null);

  useEffect(() => {
    if (!pullId) return;
    let cancelled = false;
    getPullTimeline(pullId)
      .then((data) => {
        if (!cancelled) setResult({ id: pullId, data });
      })
      .catch(() => {
        if (!cancelled) setResult({ id: pullId, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [pullId]);

  const loading = pullId !== null && result?.id !== pullId;
  const timeline = pullId !== null && result?.id === pullId ? result.data : null;

  return (
    <Dialog open={pull !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {pull && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6 text-base leading-snug">
                <span className="text-muted-foreground">#{pull.number}</span> {pull.title}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{pull.repo}</span>
                  <span aria-hidden>·</span>
                  <span>base {pull.base}</span>
                  <a
                    href={pull.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline"
                  >
                    Open on GitHub
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[70vh] overflow-y-auto pr-1">
              {loading ? (
                <TimelineSkeleton />
              ) : !timeline ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Couldn&rsquo;t load this pull request&rsquo;s history. Please try again.
                </p>
              ) : (
                <PullTimelineView timeline={timeline} />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The PR opening block (author + description) followed by its chronological activity feed. */
function PullTimelineView({ timeline }: { timeline: PullTimeline }) {
  const { header, entries, hasMore } = timeline;
  return (
    <div className="space-y-4">
      <OpeningBlock header={header} />
      <Separator />
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments or activity yet.</p>
      ) : (
        <Timeline>
          {entries.map((entry, i) => (
            <FeedItem key={i} entry={entry} isLast={i === entries.length - 1} />
          ))}
        </Timeline>
      )}
      {hasMore && (
        <p className="pt-1 text-center text-xs text-muted-foreground">
          Showing the first 50 events — open on GitHub for the full history.
        </p>
      )}
    </div>
  );
}

/** The PR author, "opened this" time, state badge, and the PR description body. */
function OpeningBlock({ header }: { header: PullTimelineHeader }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Avatar className="size-6">
          <AvatarImage src={header.authorAvatarUrl ?? undefined} alt="" />
          <AvatarFallback>{initial(header.authorLogin)}</AvatarFallback>
        </Avatar>
        <span className="font-medium">{header.authorLogin ?? "unknown"}</span>
        <span className="text-muted-foreground">opened this · {relativeTime(header.createdAt)}</span>
        <StateBadge state={header.state} isDraft={header.isDraft} />
      </div>
      {header.bodyText.trim() && (
        <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-sm">
          {header.bodyText}
        </p>
      )}
    </div>
  );
}

/** One timeline entry: a person entry (comment/review) shows an avatar dot + optional body card; a
 *  non-person entry (commit/label/state event) shows an icon dot. */
function FeedItem({ entry, isLast }: { entry: PullTimelineEntry; isLast: boolean }) {
  // Narrow once: comment + review carry an avatar and a (possibly empty) body; others are icon-only.
  const person = entry.kind === "comment" || entry.kind === "review" ? entry : null;
  const body = person && person.body.trim() ? person.body : null;
  return (
    <TimelineItem status="done" className="items-start gap-x-0">
      <TimelineDot status="custom" className="size-6 border-none bg-transparent">
        {person ? (
          <Avatar className="size-6">
            <AvatarImage src={person.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="text-[10px]">{initial(person.actor)}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {iconOf(entry)}
          </span>
        )}
      </TimelineDot>
      {!isLast && <TimelineLine className="min-h-6" />}
      <TimelineHeading
        title={headlineOf(entry)}
        className="flex items-center gap-1 pt-0.5 pl-3 text-sm font-normal text-muted-foreground"
      >
        <span className="truncate">
          <span className="font-medium text-foreground">{entry.actor ?? "someone"}</span> {verbOf(entry)}
        </span>
        <span className="shrink-0 whitespace-nowrap">· {relativeTime(entry.createdAt)}</span>
      </TimelineHeading>
      {body ? (
        <TimelineContent className="pt-1.5 pb-4 pl-3">
          <div className="whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-sm">
            {body}
          </div>
        </TimelineContent>
      ) : (
        <TimelineContent className="pb-4 pl-3" />
      )}
    </TimelineItem>
  );
}

/** The dot icon for a non-person entry (commit / label / state event). */
function iconOf(entry: PullTimelineEntry) {
  const cls = "size-3.5";
  switch (entry.kind) {
    case "comment":
      return <MessageSquare className={cls} />;
    case "review":
      if (entry.state === "APPROVED") return <CircleCheck className={cls} />;
      if (entry.state === "CHANGES_REQUESTED") return <CircleX className={cls} />;
      return <Eye className={cls} />;
    case "commit":
      return <GitCommitHorizontal className={cls} />;
    case "label":
      return <Tag className={cls} />;
    case "event":
      if (entry.event === "merged") return <GitMerge className={cls} />;
      if (entry.event === "closed") return <CircleX className={cls} />;
      return <CircleDot className={cls} />;
  }
}

/** The action phrase for an entry's headline ("commented", "approved these changes", …). */
function verbOf(entry: PullTimelineEntry): string {
  switch (entry.kind) {
    case "comment":
      return "commented";
    case "review":
      if (entry.state === "APPROVED") return "approved these changes";
      if (entry.state === "CHANGES_REQUESTED") return "requested changes";
      if (entry.state === "DISMISSED") return "had a review dismissed";
      return "reviewed";
    case "commit":
      return `committed ${entry.abbreviatedOid} — ${entry.messageHeadline}`;
    case "label":
      return `${entry.added ? "added" : "removed"} the ${entry.label} label`;
    case "event":
      return entry.detail;
  }
}

/** Plain-text "<actor> <verb>" used as the row's title (hover tooltip / a11y). */
function headlineOf(entry: PullTimelineEntry): string {
  return `${entry.actor ?? "someone"} ${verbOf(entry)}`;
}

/** Colored badge for the PR's state: Open / Draft / Merged / Closed. */
function StateBadge({ state, isDraft }: { state: string; isDraft: boolean }) {
  if (state === "MERGED") {
    return <Badge className="border-transparent bg-violet-600 text-white">Merged</Badge>;
  }
  if (state === "CLOSED") return <Badge variant="destructive">Closed</Badge>;
  if (isDraft) return <Badge variant="outline">Draft</Badge>;
  return <Badge variant="secondary">Open</Badge>;
}

/** Loading placeholder shown while the timeline is fetched. */
function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-16 w-full" />
      <Separator />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 w-56" />
        </div>
      ))}
    </div>
  );
}

/** First letter of a login for an avatar fallback. */
function initial(login: string | null): string {
  return login?.trim()?.[0]?.toUpperCase() ?? "?";
}

/** Compact relative time ("3h", "2d", "5w") with an absolute-date fallback for older items.
 *  Runs only on the client (the modal body loads after mount), so no hydration mismatch. */
function relativeTime(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(then).toLocaleDateString();
}
