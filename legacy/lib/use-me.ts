"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./client-api";
import type { Me } from "./types";

/** Current authenticated user, or null when logged out. Cached app-wide. */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<Me>("/api/auth/me");
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}
