import { IdeasBackground } from "~/components/ideas/ideas-background";
import { Nav } from "~/components/landing/nav";
import { SiteFooter } from "~/components/ui/site-footer";

/** Рамка Story-сторінок (гайди, статті, події): пасивний фон-сітка (тихіший фон, `calm`), навігація, вміст, спільний футер. */
export function GuideFrame({ children, calm = true }: { children: React.ReactNode; calm?: boolean }) {
  return (
    // Колонка на всю висоту екрана: на коротких сторінках (події одного дня) футер притиснутий донизу, а не висить посеред екрана.
    <div className="flex min-h-dvh flex-col">
      <IdeasBackground interactive={false} calm={calm} />
      <Nav forceSolid />
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-5 pt-24 pb-20 sm:px-8">{children}</main>
      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
