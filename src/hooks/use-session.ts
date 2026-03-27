"use client";

import { authClient } from "@/server/better-auth/client";
import { isAdminRole } from "@/lib/utils";

export function useSession() {
  const { data: session, isPending, error, refetch } = authClient.useSession();

  const user = session?.user ?? null;
  const role = (user as { role?: string } | null)?.role ?? "user";

  return {
    session,
    user,
    role,
    isLoading: isPending,
    isAuthenticated: !!user,
    isAdmin: isAdminRole(role),
    error,
    refetch,
  };
}