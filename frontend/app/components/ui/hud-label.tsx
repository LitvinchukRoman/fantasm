import type { ElementType, ReactNode } from "react";

/** Моно-підпис: крихти, лічильники, ключі метаданих. Стиль у `.hud-label` (app.css). */
export function HudLabel({
  as: Tag = "span",
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Tag className={["hud-label", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Tag>
  );
}
