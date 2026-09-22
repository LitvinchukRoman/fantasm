import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { IlloLogin } from "@/components/ui/illustrations";

export const metadata: Metadata = {
  title: "Вхід",
  description: "Увійдіть через Microsoft (для могилянців) або Google.",
  robots: { index: false, follow: false },
};

// Spring is the identity broker; these start the OAuth dance same-origin.
const AZURE = "/api/oauth2/authorization/azure";
const GOOGLE = "/api/oauth2/authorization/google";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const q = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="mx-auto flex max-w-md flex-col items-center pb-16 pt-6">
      <Card level={1} className="w-full space-y-6 p-8 text-center">
        <div className="flex flex-col items-center">
          <IlloLogin className="size-20" />
          <h1 className="text-h1 mt-3">Вхід</h1>
          <p className="measure-narrow mt-2 text-[color:var(--ink-2)]">
            Могилянці входять через Microsoft і отримують печатку та переваги. Решта — через Google.
          </p>
        </div>

        {/* Unified provider buttons: identical shape/weight, only the logo is coloured. */}
        <div className="space-y-3">
          <ProviderButton href={`${AZURE}${q}`}>
            <MicrosoftLogo />
            Увійти через Microsoft
          </ProviderButton>
          <div className="flex justify-center">
            <Chip tone="seal">для @ukma.edu.ua</Chip>
          </div>
          <ProviderButton href={`${GOOGLE}${q}`}>
            <GoogleLogo />
            Увійти через Google
          </ProviderButton>
        </div>

        <p className="text-xs text-[color:var(--ink-3)]">
          Входячи, ви погоджуєтесь із правилами спільноти та обробкою даних для роботи сервісу.
        </p>
      </Card>
    </div>
  );
}

function ProviderButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-1)] font-medium text-[color:var(--ink)] transition-colors duration-[var(--dur-1)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {children}
    </a>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
