import type { Metadata } from "next";
import { Suspense } from "react";
import { IdeaComposer } from "@/components/idea-composer";

export const metadata: Metadata = {
  title: "Нова ідея",
  description: "Опублікуй ідею, стартап, проєкт або подію для спільноти НаУКМА.",
  robots: { index: false, follow: true },
};

export default function NewIdeaPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
      <div>
        <h1 className="text-h1">Нова ідея</h1>
        <p className="mt-1 text-[color:var(--ink-2)]">
          Опишіть задум — спільнота допоможе голосами, порадами та руками.
        </p>
      </div>
      <Suspense>
        <IdeaComposer />
      </Suspense>
    </div>
  );
}
