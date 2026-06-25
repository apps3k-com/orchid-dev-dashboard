import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Landing page. A short product intro and entry points into the cockpit. The real
 * dashboards (PRs, Projects, repos, hooks) and editors arrive in later increments;
 * this page proves the scaffold (Next + Tailwind v4 + shadcn) renders end-to-end.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="space-y-4">
        <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
          Orchid
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          The Developer Dashboard
        </h1>
        <p className="mx-auto max-w-xl text-lg text-muted-foreground text-pretty">
          Open-source mission control for many GitHub repositories — pull requests,
          Projects, module &amp; product taxonomies, agent hooks, and automations, all in
          one place. Self-hosted, multi-org, no jumping repo to repo.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/setup">Get started</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="https://github.com/apps3k-com/orchid-dev-dashboard">
            View on GitHub
          </Link>
        </Button>
      </div>
    </main>
  );
}
