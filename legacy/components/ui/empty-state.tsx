import type { ReactNode } from "react";
import { Link } from "@/lib/link";
import { Card } from "./card";
import { Button } from "./button";
import { IlloEmptyFeed } from "./illustrations";

/**
 * Empty state with a narrative + illustration. Solid card (not glass). Pass a
 * custom `illustration`; otherwise a neutral feed illustration is shown.
 */
export function EmptyState({
  icon,
  illustration,
  title,
  description,
  action,
  actionHref,
  actionLabel,
}: {
  icon?: ReactNode;
  illustration?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <Card
      level={1}
      className="flex flex-col items-center gap-4 px-6 py-14 text-center"
    >
      <div>{illustration ?? icon ?? <IlloEmptyFeed />}</div>
      <div className="space-y-1.5">
        <h3 className="text-h3">{title}</h3>
        {description && <p className="measure-narrow text-sm text-[color:var(--ink-2)]">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
      {!action && actionHref && actionLabel && (
        <Button asChild className="mt-1">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </Card>
  );
}
