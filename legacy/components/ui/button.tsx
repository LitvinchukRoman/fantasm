import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

/**
 * One button system, one accent hue.
 *  - primary     inverted, high-contrast (ink on paper / amber on ink). One per view.
 *  - secondary   solid surface + hairline.
 *  - tertiary    text-only, ink tint on hover.
 *  - destructive tertiary with danger text (no red blocks) — pair with a confirm.
 * Legacy names (glass/ghost/danger) alias onto the new roles so nothing breaks.
 * `asChild` renders the styles onto a child (e.g. <Link>) → valid <a>, no <a><button>.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium select-none whitespace-nowrap",
    "transition-[background-color,color,transform,box-shadow,border-color] duration-[var(--dur-1)] ease-[var(--ease-out)]",
    "active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
    "[&_svg]:size-[1.1em] [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--btn-primary-bg)] text-[color:var(--btn-primary-fg)] hover:bg-[var(--btn-primary-bg-hover)]",
        secondary:
          "bg-[var(--surface-2)] text-[color:var(--ink)] border border-[var(--line)] hover:bg-[var(--surface-3)] hover:border-[var(--line-strong)]",
        tertiary:
          "bg-transparent text-[color:var(--ink-2)] hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] hover:text-[color:var(--ink)]",
        destructive:
          "bg-transparent text-[color:var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]",
        accent:
          "bg-[var(--accent)] text-[color:var(--accent-contrast)] hover:brightness-[1.06]",
        // legacy aliases
        glass:
          "bg-[var(--surface-2)] text-[color:var(--ink)] border border-[var(--line)] hover:bg-[var(--surface-3)] hover:border-[var(--line-strong)]",
        ghost:
          "bg-transparent text-[color:var(--ink-2)] hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] hover:text-[color:var(--ink)]",
        danger:
          "bg-transparent text-[color:var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-[15px]",
        lg: "h-13 px-7 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ComponentPropsWithoutRef<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
