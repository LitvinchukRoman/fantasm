import { Link } from "@/lib/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Spark } from "@/components/ui/spark";
import { Constellation } from "./constellation";
import { FlowLines } from "./flow-lines";
import { StatCounter } from "./stat-counter";

export function Hero({ stats }: { stats: { ideas: number; teams: number; events: number } }) {
  return (
    <section className="relative isolate grid items-center gap-10 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:py-14">
      {/* Ambient light ribbons — flow across the field, faded out of the top-left
          headline zone so copy stays crisp (mask + -webkit-mask for Safari). */}
      <FlowLines className="absolute inset-0 -z-10 [-webkit-mask-image:linear-gradient(150deg,transparent_0%,transparent_30%,black_72%)] [mask-image:linear-gradient(150deg,transparent_0%,transparent_30%,black_72%)]" />
      <div>
        <Chip tone="accent" className="gap-1.5">
          <Spark accent className="size-3.5" /> Спільнота Києво-Могилянської академії
        </Chip>
        <h1 className="text-display mt-5">
          Від іскри —<br />
          до <span className="text-[color:var(--accent-ink)]">команди</span>
        </h1>
        <p className="measure mt-5 text-lg text-[color:var(--ink-2)]">
          Публікуй стартап, пет-проєкт, дослідження чи подію. Збирай голоси, обговорення й однодумців.
          Могилянці отримують печатку та переваги кампусу.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/ideas/new">
              Запропонувати ідею <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/ideas">Дивитися ідеї</Link>
          </Button>
        </div>
        <div className="mt-10 flex gap-10 border-t border-[var(--line)] pt-6">
          <StatCounter value={stats.ideas} label="ідей спільноти" />
          <StatCounter value={stats.teams} label="команд формується" />
          <StatCounter value={stats.events} label="подій попереду" />
        </div>
      </div>

      <div className="scroll-constellation relative mx-auto aspect-square w-full max-w-md">
        <Constellation className="size-full" />
      </div>
    </section>
  );
}
