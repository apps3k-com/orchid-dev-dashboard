"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  FolderGit2,
  FolderKanban,
  GitPullRequest,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Tags,
  Webhook,
  Workflow,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const VIEWS: NavItem[] = [
  { href: "/command", label: "Command Center", icon: Inbox },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pulls", label: "Pull requests", icon: GitPullRequest },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/repos", label: "Repositories", icon: FolderGit2 },
  { href: "/hooks", label: "Hooks", icon: Webhook },
  { href: "/audits", label: "Audits", icon: ShieldCheck },
  { href: "/compliance", label: "Compliance", icon: BadgeCheck },
];

const SETTINGS: NavItem[] = [
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/settings/products", label: "Products", icon: Tags },
  { href: "/settings/ai-providers", label: "AI providers", icon: KeyRound },
];

type SidebarUser = { login: string; name: string | null; avatarUrl: string | null };

/** One labelled group of sidebar links (highlights the active route). */
function NavSection({
  items,
  pathname,
  label,
}: {
  items: NavItem[];
  pathname: string;
  label?: string;
}) {
  return (
    <SidebarGroup>
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Cockpit navigation sidebar: managed-repo views, a settings group, and the signed-in user. */
export function AppSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const initials = (user.name ?? user.login).slice(0, 2).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/command" className="flex items-center gap-2 px-2 py-1.5 font-semibold">
          <LayoutDashboard className="text-primary size-5" />
          <span>Orchid</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavSection items={VIEWS} pathname={pathname} />
        <NavSection items={SETTINGS} pathname={pathname} label="Settings" />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-8 rounded-md">
                    {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.login} /> : null}
                    <AvatarFallback className="rounded-md">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-sm leading-tight">
                    <span className="font-medium">{user.name ?? user.login}</span>
                    <span className="text-muted-foreground text-xs">@{user.login}</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  Signed in as <span className="font-medium">@{user.login}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <form action="/api/auth/logout" method="post" className="contents">
                  <DropdownMenuItem variant="destructive" asChild>
                    <button type="submit">
                      <LogOut className="size-4" />
                      Sign out
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
