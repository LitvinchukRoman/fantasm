import { Link } from "@/lib/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Illo404 } from "@/components/ui/illustrations";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card level={1} className="max-w-md space-y-4 p-10 text-center">
        <Illo404 className="mx-auto size-24" />
        <h1 className="text-h1">Сторінку не знайдено</h1>
        <p className="text-[color:var(--ink-2)]">
          Можливо, ідею прибрали або посилання застаріло.
        </p>
        <Button asChild size="lg">
          <Link href="/">На головну</Link>
        </Button>
      </Card>
    </div>
  );
}
