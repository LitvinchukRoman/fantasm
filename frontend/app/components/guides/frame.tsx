import { IdeasBackground } from "~/components/ideas/ideas-background";
import { Nav } from "~/components/landing/nav";
import { SiteFooter } from "~/components/ui/site-footer";

/** Рамка Story-сторінок (гайди, статті, події): пасивний фон-сітка, навігація, вміст, спільний футер. */
export function GuideFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <IdeasBackground interactive={false} />
      <Nav forceSolid />
      <main className="relative z-10 mx-auto max-w-6xl px-5 pt-24 pb-20 sm:px-8">{children}</main>
      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
