import { useState, useEffect, useRef } from "react";
import { data, Link } from "react-router";
import { IdeaRow } from "~/components/ideas/idea-row";
import { CurvedRows } from "~/components/ideas/curved-rows";
import { IdeasBackground } from "~/components/ideas/ideas-background";
import { Nav } from "~/components/landing/nav";
import { formatShortDate } from "~/lib/ideas";
import { getIdeas, toCard } from "~/lib/ideas.server";
import { getUserProfile } from "~/lib/users.server";
import { seo } from "~/lib/seo";
import type { Route } from "./+types/profile";

const MOCK_CURRENT_USER = {
  handle: "naukma-ideas", 
  verified: true,
};

export function loader({ params }: Route.LoaderArgs) {
  const profile = getUserProfile(params.handle);
  if (!profile) throw data("Not found", { status: 404 });
  
  const currentUser = MOCK_CURRENT_USER;
  const isOwner = currentUser?.handle === profile.handle;
  const isVerifiedGuest = currentUser?.verified === true;

  let userIdeas = getIdeas()
    .filter(idea => idea.author.handle === profile.handle)
    .filter(idea => {
      if (isOwner) return true;
      if (isVerifiedGuest) return true;
      return idea.visibility === "PUBLIC";
    })
    .map(toCard);
  
  return { profile, ideas: userIdeas, isOwner };
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

function VerifiedBadge() {
  return (
    <div className="mt-4 inline-flex items-center gap-3 border-y border-[var(--color-border-strong)] py-2 text-xs font-bold uppercase tracking-widest text-[var(--color-text)] font-mono">
      <span aria-hidden="true" className="h-2 w-2 bg-[var(--color-text)] animate-pulse" />
      ВЕРИФІКОВАНО
    </div>
  );
}

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 60); // Швидкість друку
    return () => clearInterval(interval);
  }, [text]);

  return (
    <span>
      {displayed}
      <span className="inline-block w-2 h-[1em] ml-1 bg-white animate-pulse align-middle" />
    </span>
  );
}

function useCurvedMode(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(wide.matches && !calm.matches);
    update();
    wide.addEventListener("change", update);
    calm.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      calm.removeEventListener("change", update);
    };
  }, []);
  return enabled;
}

function EditProfileButton() {
  const pillRef = useRef<HTMLSpanElement>(null);
  
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const frame = useRef(0);
  const PILL_EASE = 0.1;
  const PILL_HALF_WIDTH = 64;
  const PILL_HALF_HEIGHT = 16;
  const PILL_LIFT = 20;

  function paint() {
    const pill = pillRef.current;
    if (!pill) return;
    const dx = target.current.x - current.current.x;
    const dy = target.current.y - current.current.y;
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
      current.current = { ...target.current };
      frame.current = 0;
    } else {
      current.current = { x: current.current.x + dx * PILL_EASE, y: current.current.y + dy * PILL_EASE };
      frame.current = requestAnimationFrame(paint);
    }
    pill.style.transform = `translate3d(${current.current.x}px, ${current.current.y}px, 0)`;
  }

  function aim(event: React.PointerEvent<HTMLButtonElement>, snap: boolean) {
    const rect = event.currentTarget.getBoundingClientRect();
    target.current = {
      x: event.clientX - rect.left - PILL_HALF_WIDTH,
      y: event.clientY - rect.top - PILL_HALF_HEIGHT - PILL_LIFT,
    };
    if (snap) current.current = { ...target.current };
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  }

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <button
      type="button"
      className="btn-tactical group relative"
      onPointerEnter={(event) => aim(event, true)}
      onPointerMove={(event) => aim(event, false)}
    >
      [ РЕДАГУВАТИ_ПРОФІЛЬ ]
      <span ref={pillRef} aria-hidden="true" className="idea-pill">
        Редагувати
      </span>
    </button>
  );
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
    <div className="min-h-dvh">
      <IdeasBackground />
      <Nav forceSolid />
      
      <main className="relative z-10 mx-auto max-w-7xl px-0 pt-28 pb-20 sm:px-8">
        <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8">
          
          {/* Сайдбар (Ліва колонка) */}
          <aside className="lg:sticky lg:top-36 mt-8 lg:self-start bg-transparent z-20 pointer-events-auto">
            <div className="p-8 space-y-10">
              
              {/* Аватар та Інформація */}
              <div>
                <div className="mb-6 inline-flex h-32 w-32 items-center justify-center border-4 border-white bg-transparent text-6xl font-black text-white uppercase font-sans">
                  {profile.name.charAt(0)}
                </div>
                
                <div>
                  <h1 className="text-3xl font-black uppercase tracking-tighter text-white font-sans">{profile.name}</h1>
                  <p className="mt-1 text-sm font-mono text-[var(--color-text-muted)]">ID: @{profile.handle.toUpperCase()}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-faint)]">
                    АКАУНТ_СТВОРЕНО: {profile.joinedAt.split('T')[0]}
                  </p>
                  {profile.verified && <div className="mt-3"><VerifiedBadge /></div>}
                </div>
              </div>

              {/* Біографія */}
              {profile.bio && (
                <div className="font-mono text-sm leading-relaxed text-white">
                  <TypewriterText text={profile.bio} />
                </div>
              )}

              {/* Статистика */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-transparent border border-[var(--color-border-strong)] p-4 text-center">
                  <span className="block font-mono text-2xl font-bold text-white tabular-nums">{profile.karma}</span>
                  <span className="mt-1 block text-[10px] text-[var(--color-text-faint)] uppercase tracking-widest font-mono">Карма</span>
                </div>
                <div className="bg-transparent border border-[var(--color-border-strong)] p-4 text-center">
                  <span className="block font-mono text-2xl font-bold text-white tabular-nums">{ideas.length}</span>
                  <span className="mt-1 block text-[10px] text-[var(--color-text-faint)] uppercase tracking-widest font-mono">Ідей</span>
                </div>
              </div>

              {/* Дії власника */}
              {isOwner && (
                <div className="pt-4 border-t border-[var(--color-border-strong)]">
                  <EditProfileButton />
                </div>
              )}
            </div>
          </aside>

          {/* Стрічка ідей (Права колонка) */}
          <div className={curved ? "min-w-0 bg-transparent relative h-dvh -mt-28 profile-curved-container" : "min-w-0 bg-transparent relative"}>
            {!curved && (
              <div className="px-8 py-6">
                <h2 className="font-mono text-sm font-bold text-white uppercase tracking-widest">
                  <span className="mr-3 opacity-50">///</span> ІДЕЇ КОРИСТУВАЧА
                </h2>
              </div>
            )}
            
            {curved && (
              <div className="absolute inset-0 z-0 pointer-events-none lg:pl-12">
                <CurvedRows
                  items={ideas}
                  keyOf={(idea) => idea.slug}
                  renderRow={(idea, index, decorative) => (
                    <div className="pl-4 pr-4 pointer-events-auto">
                      <IdeaRow idea={idea} number={String(index + 1).padStart(2, "0")} decorative={decorative} />
                    </div>
                  )}
                />
              </div>
            )}

            {!curved && ideas.length === 0 && (
              <div className="p-12 text-center font-mono">
                <p className="text-sm text-[var(--color-text-muted)] uppercase tracking-widest">
                  [ NULL_DATA: NO_RECORDS_FOUND ]
                </p>
                {isOwner && (
                  <Link
                    to="/ideas/new"
                    className="mt-6 inline-block border-2 border-white px-6 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-white hover:text-black transition-colors"
                  >
                    CREATE_RECORD
                  </Link>
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
    </div>
  );
}
