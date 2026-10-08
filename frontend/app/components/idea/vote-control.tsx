import { Button } from "~/components/ui/button";
import { useFetcher, useRouteLoaderData } from "react-router";
import type { RootData } from "~/root";

function IconUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15.5V5M5.5 9.5 10 4.5l4.5 5" />
    </svg>
  );
}

export function VoteControl({ score, voted = false, variant = "primary", size = "md" }: { score: number; voted?: boolean; variant?: "primary" | "secondary"; size?: "md" | "sm" }) {
  const fetcher = useFetcher<{ votes?: number; voted?: boolean; error?: string }>();
  const root = useRouteLoaderData<RootData>("root");
  const active = fetcher.data?.voted ?? voted;
  const count = fetcher.data?.votes ?? score;
  if (!root?.currentUser) {
    return <Button to="/login" variant={variant} size={size}><IconUp className="size-4" />Підтримати <span className="tabular-nums opacity-70">{count}</span></Button>;
  }
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="vote" />
      <input type="hidden" name="remove" value={active ? "true" : "false"} />
      <Button type="submit" disabled={fetcher.state !== "idle"} variant={active ? "secondary" : variant} size={size} aria-label={`${active ? "Забрати голос" : "Підтримати ідею"}, зараз голосів: ${count}`}>
        <IconUp className="size-4" />
        <span>{active ? "Підтримано" : "Підтримати"}</span>
        <span className="tabular-nums opacity-70">{count}</span>
      </Button>
    </fetcher.Form>
  );
}
