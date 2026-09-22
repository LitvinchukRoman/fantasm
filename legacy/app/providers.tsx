"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {/* Every framer-motion animation honours the OS "reduce motion" setting. */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>{children}</ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
