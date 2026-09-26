import { Nav } from "~/components/landing/nav";

export function GuideFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <Nav forceSolid />
      <main className="mx-auto max-w-6xl px-5 pt-24 pb-20 sm:px-8">{children}</main>
    </div>
  );
}
