import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/**
 * Solid content surface — depth comes from tone + a 1px hairline, NOT from
 * heavy shadows or glass. This is the default surface for all content.
 *  - level 1  surface-1 (base)
 *  - level 2  surface-2 (raised)
 * `interactive` adds a restrained hover (border + tone step, never lift+shadow).
 */
export function Card({
  level = 1,
  as: Tag = "div",
  interactive = false,
  className,
  children,
  ...rest
}: Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  level?: 1 | 2;
  as?: ElementType;
  interactive?: boolean;
  children?: ReactNode;
}) {
  const El = Tag as "div";
  return (
    <El
      className={cn(
        "rounded-2xl border border-[var(--line)]",
        level === 1 ? "bg-[var(--surface-1)]" : "bg-[var(--surface-2)]",
        interactive &&
          "transition-colors duration-[var(--dur-2)] ease-[var(--ease-out)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]",
        className,
      )}
      {...rest}
    >
      {children}
    </El>
  );
}
