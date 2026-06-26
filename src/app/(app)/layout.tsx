import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/server/auth/require";

export const dynamic = "force-dynamic";

/** Shared shell for the authenticated cockpit: guards access and renders the sidebar + header. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <SidebarProvider>
      <AppSidebar user={{ login: user.login, name: user.name, avatarUrl: user.avatarUrl }} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Orchid — Developer Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
