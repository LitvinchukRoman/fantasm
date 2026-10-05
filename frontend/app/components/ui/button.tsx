import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";
import { IconArrowRight } from "~/components/landing/icons";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-[background-color,color,border-color,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] active:scale-[0.98]";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-bg)] hover:bg-[var(--color-accent-strong)] [@media(hover:hover)]:hover:scale-105",
  secondary:
    "border border-[var(--color-border-strong)] text-[var(--color-text)] hover:bg-[var(--color-surface-strong)] [@media(hover:hover)]:hover:scale-105",
  ghost: "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
};

const SIZES: Record<Size, string> = {
  md: "px-5 py-2.5 text-sm",
  sm: "px-4 py-2 text-sm",
};

type Common = {
  variant?: Variant;
  size?: Size;
  /** Стрілка праворуч, як на всіх головних діях. */
  arrow?: boolean;
  className?: string;
  children: ReactNode;
};

type AsLink = Common & { to: string } & Omit<ComponentProps<typeof Link>, "to" | "className" | "children">;
type AsButton = Common & { to?: undefined } & Omit<ComponentProps<"button">, "className" | "children">;

/**
 * Єдина кнопка сайту: повна пігулка. Primary (акцент), secondary (контур), ghost (текст).
 * З пропом `to` це Link, інакше button.
 */
export function Button(props: AsLink | AsButton) {
  const { variant = "primary", size = "md", arrow = false, className, children, ...rest } = props;
  const classes = [BASE, VARIANTS[variant], SIZES[size], className].filter(Boolean).join(" ");
  const content = (
    <>
      {children}
      {arrow && <IconArrowRight className="size-4" />}
    </>
  );

  if ("to" in rest && rest.to !== undefined) {
    const { to, prefetch = "intent", ...linkRest } = rest as Omit<AsLink, keyof Common>;
    return (
      <Link to={to} prefetch={prefetch} className={classes} {...linkRest}>
        {content}
      </Link>
    );
  }
  const { to: _unused, ...buttonRest } = rest as Omit<AsButton, keyof Common>;
  return (
    <button type="button" className={classes} {...buttonRest}>
      {content}
    </button>
  );
}
