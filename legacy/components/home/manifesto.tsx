import { Link } from "@/lib/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Closing manifesto + CTA — large editorial type, one accent word. */
export function Manifesto() {
  return (
    <section className="py-8 text-center sm:py-12">
      <p className="text-h1 mx-auto max-w-3xl text-balance">
        Найкращі ідеї помирають не від браку таланту, а від браку{" "}
        <span className="text-[color:var(--accent-ink)]">людей поруч</span>. Тут вони знаходять одне одного.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/ideas/new">
            Поділитися ідеєю <ArrowRight />
          </Link>
        </Button>
        <Button asChild size="lg" variant="tertiary">
          <Link href="/guides">Почитати гайди</Link>
        </Button>
      </div>
    </section>
  );
}
