import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { DecisionDismissButton } from "@/components/decision-dismiss-button";
import EmptyState from "@/components/shadcn-studio/blocks/empty-state-02/empty-state-02";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Timeline,
  TimelineContent,
  TimelineDot,
  TimelineHeading,
  TimelineItem,
  TimelineLine,
} from "@/components/ui/timeline";
import { decisionKindStyle, isInternalUrl, relativeAge } from "@/lib/decision-ui";
import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { getDecisionQueue } from "@/server/decisions/queue";

export const dynamic = "force-dynamic";

const SEVERITY_BADGE = {
  error: "destructive",
  warning: "secondary",
  info: "outline",
} as const;

/** Command Center: the Decision Queue (everything needing a human call) + a live activity feed. */
export default async function CommandCenterPage() {
  await requireUser();
  const now = new Date();

  const [decisions, signals] = await Promise.all([
    getDecisionQueue(),
    prisma.signal.findMany({
      orderBy: { occurredAt: "desc" },
      take: 15,
      include: { repo: { select: { nameWithOwner: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Command Center</h1>
        <p className="text-sm text-muted-foreground">
          Everything across the fleet that needs your decision, in one place.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {decisions.length === 0 ? (
          <div className="lg:col-span-2">
            <EmptyState
              title="Decision queue"
              description="Failing checks, review threads, ready-to-merge PRs and open audit findings."
              message="Nothing needs your attention right now"
              hint="New signals appear here as they arrive."
            />
          </div>
        ) : (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Decision queue
                <Badge variant="default">{decisions.length}</Badge>
              </CardTitle>
              <CardDescription>
                Failing checks, review threads, ready-to-merge PRs and open audit findings — highest
                priority first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {decisions.map((item) => {
                  const style = decisionKindStyle(item.kind);
                  const internal = isInternalUrl(item.externalUrl);
                  return (
                    <li
                      key={item.dedupeKey}
                      className="flex items-start justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={style.badge}>{style.label}</Badge>
                          {item.repo ? (
                            <span className="text-xs text-muted-foreground">{item.repo}</span>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {relativeAge(item.occurredAt, now)}
                          </span>
                        </div>
                        <p className="text-sm">{item.title}</p>
                        {item.detail ? (
                          <p className="text-xs text-muted-foreground">{item.detail}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {item.externalUrl ? (
                          <Button variant="ghost" size="sm" className="size-8 p-0" asChild>
                            <Link
                              href={item.externalUrl}
                              aria-label="Open"
                              {...(internal ? {} : { target: "_blank", rel: "noreferrer" })}
                            >
                              <ExternalLink className="size-4" />
                            </Link>
                          </Button>
                        ) : null}
                        <DecisionDismissButton dedupeKey={item.dedupeKey} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {signals.length === 0 ? (
          <EmptyState
            title="Activity"
            description="Latest events across the fleet (webhook event spine)."
            message="No events yet"
            hint="Activity appears here as GitHub webhooks arrive."
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>
                Latest events across the fleet (webhook event spine).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Timeline>
                {signals.map((signal, index) => (
                  <TimelineItem key={signal.id} status="default">
                    <TimelineHeading className="text-sm">{signal.title}</TimelineHeading>
                    <TimelineDot />
                    {index < signals.length - 1 ? <TimelineLine done /> : null}
                    <TimelineContent className="flex flex-wrap items-center gap-2">
                      {signal.severity !== "info" ? (
                        <Badge variant={SEVERITY_BADGE[signal.severity as "error" | "warning"]}>
                          {signal.severity}
                        </Badge>
                      ) : null}
                      {signal.repo ? <span>{signal.repo.nameWithOwner}</span> : null}
                      <span>{relativeAge(signal.occurredAt, now)}</span>
                    </TimelineContent>
                  </TimelineItem>
                ))}
              </Timeline>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
