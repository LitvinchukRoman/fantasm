import { useEffect } from "react";
import { data } from "react-router";
import { IdeaRow } from "~/components/ideas/idea-row";
import { CurvedRows } from "~/components/ideas/curved-rows";
import { IdeasBackground } from "~/components/ideas/ideas-background";
import { Nav } from "~/components/landing/nav";
import { Button } from "~/components/ui/button";
import { HudLabel } from "~/components/ui/hud-label";
import { MetaGrid } from "~/components/ui/meta-grid";
import { SiteFooter } from "~/components/ui/site-footer";
import { VerifiedSeal } from "~/components/ui/verified-seal";
import { formatShortDate } from "~/lib/ideas";
import { getCurrentUser, getProfile, routeApi } from "~/lib/api.server";
import { toIdeaCard } from "~/lib/ideas";
import { seo } from "~/lib/seo";
import { useCurvedMode } from "~/lib/use-curved-mode";
import type { Route } from "./+types/profile";

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.handle) throw data("Not found", { status: 404 });
  const [profile, currentUser] = await routeApi(Promise.all([getProfile(request, params.handle), getCurrentUser(request)]));
  return {
    profile: {
      ...profile,
      bio: profile.bio ?? "",
      verified: profile.verified ?? false,
      role: profile.role ?? "USER",
      karma: profile.karma ?? 0,
    },
    ideas: (profile.ideas ?? []).map(toIdeaCard),
    isOwner: currentUser?.handle === profile.handle,
  };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { profile } = data;
  return seo({
    title: `${profile.name} (@${profile.handle}) — Fantasm`,
    description: profile.bio || `Профіль користувача ${profile.name}`,
    path: `/u/${profile.handle}`,
  });
}

export default function ProfilePage({ loaderData }: Route.ComponentProps) {
  const { profile, ideas, isOwner } = loaderData;
  const curved = useCurvedMode() && ideas.length >= 2;

  useEffect(() => {
    if (!curved) return;
    document.documentElement.classList.add("ideas-curved");
    return () => document.documentElement.classList.remove("ideas-curved");
  }, [curved]);

  return (
    <div className="flex min-h-dvh flex-col">
      <IdeasBackground />
      <Nav forceSolid />

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-5 pt-28 pb-20 sm:px-8">
        <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8">
          {/* Ліва колонка: людина. Печатка, ім'я й дані тією ж мовою, що на сторінці ідеї. */}
          <aside className="z-20 mt-8 space-y-8 lg:sticky lg:top-36 lg:self-start lg:pr-4">
            <div>
              <span
                aria-hidden="true"
                className="mb-6 grid size-24 place-items-center rounded-full border border-[var(--color-border-strong)] text-4xl text-[var(--color-text)]"
              >
                {profile.name.charAt(0).toUpperCase()}
              </span>
              <h1 className="display-entity text-3xl">{profile.name}</h1>
              <HudLabel as="p" className="mt-2">
                @{profile.handle}
              </HudLabel>
              {profile.verified && (
                <div className="mt-4">
                  <VerifiedSeal />
                </div>
              )}
            </div>

            {profile.bio && <p className="text-[var(--color-text-muted)]">{profile.bio}</p>}

            <MetaGrid
              items={[
                { label: "Ідей", value: <span className="tabular-nums">{ideas.length}</span> },
                { label: "Карма", value: <span className="tabular-nums">{profile.karma}</span> },
                { label: "Факультет", value: profile.faculty },
                { label: "З нами з", value: <time dateTime={profile.joinedAt}>{formatShortDate(profile.joinedAt)}</time> },
              ]}
            />

            {isOwner && (
              <Button to="/settings" variant="secondary" size="sm">
                Редагувати профіль
              </Button>
            )}
          </aside>

          {/* Права колонка: ідеї людини тими самими рядками, що у стрічці. */}
          <div className={curved ? "profile-curved-container relative -mt-28 h-dvh min-w-0" : "relative min-w-0"}>
            {!curved && (
              <div className="py-6">
                <HudLabel as="h2" className="!text-[var(--color-text-muted)]">
                  Ідеї користувача · {ideas.length}
                </HudLabel>
              </div>
            )}

            {curved && (
              <div className="pointer-events-none absolute inset-0 z-0 lg:pl-12">
                <CurvedRows
                  items={ideas}
                  keyOf={(idea) => idea.slug}
                  renderRow={(idea, index, decorative) => (
                    <div className="pointer-events-auto px-4">
                      <IdeaRow idea={idea} number={String(index + 1).padStart(2, "0")} decorative={decorative} />
                    </div>
                  )}
                />
              </div>
            )}

            {!curved && ideas.length === 0 && (
              <div className="border-y border-dashed border-[var(--color-border-strong)] px-6 py-14 text-center">
                <p className="text-[var(--color-text)]">Ще немає ідей</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">
                  {isOwner ? "Поділись першою, і вона зʼявиться тут." : "Коли людина щось опублікує, це зʼявиться тут."}
                </p>
                {isOwner && (
                  <div className="mt-6 flex justify-center">
                    <Button to="/ideas/new" arrow>
                      Запропонувати ідею
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!curved && ideas.length > 0 && (
              <ul className="idea-rows idea-rows--flow">
                {ideas.map((idea, index) => (
                  <li key={idea.slug}>
                    <IdeaRow idea={idea} number={String(index + 1).padStart(2, "0")} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
      {!curved && <SiteFooter />}
    </div>
  );
}
