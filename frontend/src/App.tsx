import { useEffect, useState } from "react";

type Health = "checking" | "ok" | "down";

type Feed = {
  items: unknown[];
  nextCursor: string | null;
};

export default function App() {
  const [health, setHealth] = useState<Health>("checking");
  const [feed, setFeed] = useState<Feed | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/healthz")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("health"))))
      .then(() => {
        if (!cancelled) setHealth("ok");
      })
      .catch(() => {
        if (!cancelled) setHealth("down");
      });

    fetch("/api/v1/ideas")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("feed"))))
      .then((body: Feed) => {
        if (!cancelled) setFeed(body);
      })
      .catch(() => {
        if (!cancelled) setFeed(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <p className="mark">НаУКМА</p>
      <h1>Fantasm</h1>
      <p className="lead">
        Платформа ідей — від стартапів і волонтерства до книжкових клубів.
        Могилянці позначені окремо. Під ідеєю живе обговорення.
      </p>
      <p className="status">
        API: {health === "checking" ? "перевіряю…" : health === "ok" ? "відповідає" : "недоступний"}
        {feed ? ` · ідей у стрічці: ${feed.items.length}` : null}
      </p>
      <p className="hint">
        Це порожня накидка клієнта. Інтент продукту — у FULL_CONTEXT.md у корені
        репозиторію. Старий інтерфейс лежить у legacy/ і не є макетом.
      </p>
    </main>
  );
}
