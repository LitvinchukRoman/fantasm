import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type GlassLevel = 1 | 2 | 3;

interface GlassCardProps extends ComponentPropsWithoutRef<"div"> {
  level?: GlassLevel;
  as?: ElementType;
  sheen?: boolean;
  children?: ReactNode;
}

const LEVEL: Record<GlassLevel, string> = {
  1: "glass-1",
  2: "glass-2",
  3: "glass-3",
};

/** Frosted surface at one of the three depths defined in globals.css. */
export function GlassCard({
  level = 2,
  as: Tag = "div",
  sheen = false,
  className,
  children,
  ...rest
}: GlassCardProps) {
  const El = Tag as "div";
  return (
    <El className={cn(LEVEL[level], sheen && "liquid-glass-sheen", className)} {...rest}>
      {children}
    </El>
  );
}
