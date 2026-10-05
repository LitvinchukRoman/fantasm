import { Button } from "~/components/ui/button";
import { SiteFooter } from "~/components/ui/site-footer";

/** Фінальний заклик лендінгу і спільний футер сайту. */
export function CtaFooter() {
  return (
    <>
      <section className="relative z-10 flex min-h-[78vh] flex-col items-center justify-center overflow-hidden px-5 py-24 text-center sm:px-8">
        <p className="relative z-10 mx-auto max-w-2xl text-2xl font-semibold text-white sm:text-3xl">
          Найкращі ідеї помирають не від браку таланту, а від браку людей поруч. Тут вони знаходять одне одного.
        </p>
        <div className="mt-8">
          <Button to="/ideas/new" arrow>
            Поділитися ідеєю
          </Button>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
