import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/server/auth/require";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pulls", label: "Pull requests" },
  { href: "/repos", label: "Repositories" },
];

/** Shared shell for the authenticated cockpit: guards access and renders the top nav. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <nav className="mx-auto flex w-full max-w-6xl items-center gap-5 px-6 py-3 text-sm">
          <Link href="/dashboard" className="font-semibold">
            Orchid
          </Link>
          {NAV.slice(1).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <form action="/api/auth/logout" method="post" className="ml-auto">
            <button
              type="submit"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
