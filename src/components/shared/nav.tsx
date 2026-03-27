"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/server/better-auth/client";
import { useSession } from "@/hooks/use-session";
import { cn, getInitials, getRoleBadgeVariant, capitalize } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  MessageSquare,
  LayoutDashboard,
  BookOpen,
  Bot,
  LogOut,
  User,
  ChevronDown,
} from "lucide-react";

const mainLinks = [
  {
    href: "/chat",
    label: "Chat",
    icon: MessageSquare,
  },
];

const adminLinks = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/knowledge",
    label: "Knowledge base",
    icon: BookOpen,
  },
  {
    href: "/admin/agents",
    label: "Agents",
    icon: Bot,
  },
];

export function Nav() {
  const { user, role, isAdmin } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    toast.success("Signed out successfully");
    router.replace("/login");
  }

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-background px-3 py-4">
      {/* Logo */}
      <div className="mb-6 px-2">
        <span className="text-lg font-semibold tracking-tight">
          Virtual Agent
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-1">
        {mainLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              pathname.startsWith(href)
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Admin section */}
      {isAdmin && (
        <>
          <Separator className="my-4" />
          <p className="mb-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Admin
          </p>
          <nav className="flex flex-col gap-1">
            {adminLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === href
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      <Separator className="mb-4" />

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent transition-colors outline-none">
          <Avatar className="h-7 w-7">
            <AvatarImage src={user?.image ?? ""} alt={user?.name ?? ""} />
            <AvatarFallback className="text-xs">
              {getInitials(user?.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col items-start min-w-0">
            <span className="truncate text-xs font-medium w-full text-left">
              {user?.name ?? "User"}
            </span>
            <Badge
              variant={getRoleBadgeVariant(role as "user" | "admin" | "developer")}
              className="h-4 px-1 text-[10px] mt-0.5"
            >
              {capitalize(role)}
            </Badge>
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" side="top" className="w-48">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal truncate">
            {user?.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => router.push("/profile")}
            className="cursor-pointer"
          >
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}