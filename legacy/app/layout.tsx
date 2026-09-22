import type { Metadata, Viewport } from "next";
import { ViewTransitions } from "next-view-transitions";
import "./globals.css";
import { fixelDisplay, fixelText, jetbrainsMono } from "./fonts";
import { Providers } from "./providers";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ideas.naukma.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NaUKMA Ideas — платформа ідей спільноти",
    template: "%s — NaUKMA Ideas",
  },
  description:
    "Публікуй ідеї, стартапи та події, збирай команду й голоси спільноти Києво-Могилянської академії та друзів.",
  applicationName: "NaUKMA Ideas",
  openGraph: {
    type: "website",
    locale: "uk_UA",
    siteName: "NaUKMA Ideas",
    url: siteUrl,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#101014" },
  ],
};

// Applies the persisted (cookie) or system theme class before first paint → no FOUC.
const themeInit = `(function(){try{var e=document.documentElement,m=document.cookie.match(/(?:^|;\\s*)theme=(dark|light)/),t=m?m[1]:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');e.classList.add(t);e.style.colorScheme=t;}catch(_){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="uk"
      className={`${fixelDisplay.variable} ${fixelText.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-[color:var(--accent-contrast)]"
        >
          Перейти до контенту
        </a>
        <ViewTransitions>
          <Providers>
            <SiteNav />
            <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
              {children}
            </main>
            <SiteFooter />
          </Providers>
        </ViewTransitions>
      </body>
    </html>
  );
}
