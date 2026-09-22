import { Link } from "@/lib/link";
import { BadgeCheck, Eye, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/ui/verified-badge";

const PERKS = [
  { icon: BadgeCheck, title: "Печатка могилянця", body: "Верифікація через @ukma.edu.ua робить твій профіль і ідеї помітнішими." },
  { icon: Eye, title: "Внутрішні ідеї", body: "Доступ до ідей із видимістю «лише НаУКМА» — те, що не бачать зовні." },
  { icon: Sparkles, title: "Більше ваги", body: "Голоси й події могилянців мають пріоритет у кампус-стрічці." },
];

/** The campus advantage made visible — the accent/seal works as a privilege. */
export function MohylianPerks() {
  return (
    <section className="card-2 relative overflow-hidden p-7 sm:p-10">
      {/* single soft seal-coloured light, top-right */}
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--seal)_28%,transparent),transparent_70%)]" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <VerifiedBadge showLabel size={22} />
        </div>
        <h2 className="text-h2 mt-3 max-w-xl">Для могилянців — окремі переваги</h2>
        <p className="measure mt-2 text-[color:var(--ink-2)]">
          Увійди через університетську пошту, щоб отримати печатку та доступ до внутрішніх можливостей спільноти.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {PERKS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title}>
                <Icon className="size-5 text-[color:var(--seal)]" />
                <h3 className="mt-3 font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-[color:var(--ink-2)]">{p.body}</p>
              </div>
            );
          })}
        </div>
        <Button asChild variant="secondary" className="mt-8">
          <Link href="/login">Увійти через Microsoft</Link>
        </Button>
      </div>
    </section>
  );
}
