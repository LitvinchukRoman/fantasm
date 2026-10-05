import { Button } from "~/components/ui/button";

function IconUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15.5V5M5.5 9.5 10 4.5l4.5 5" />
    </svg>
  );
}

/** Голос за ідею. Клік веде на вхід, доки немає сесії і Go-API. */
export function VoteControl({ score, variant = "primary", size = "md" }: { score: number; variant?: "primary" | "secondary"; size?: "md" | "sm" }) {
  return (
    <Button to="/login" variant={variant} size={size} aria-label={`Підтримати ідею, зараз голосів: ${score}`}>
      <IconUp className="size-4" />
      <span>Підтримати</span>
      <span className="tabular-nums opacity-70">{score}</span>
    </Button>
  );
}
