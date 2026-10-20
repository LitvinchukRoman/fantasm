import type { ComponentType } from "react";
import { IconCheck, IconGitHub, IconInstagram, IconLinkedIn, type IconProps } from "~/components/landing/icons";
import { PROFILE_LINKS, type ProfileLinkKey } from "~/lib/profile";

const ICONS: Record<ProfileLinkKey, ComponentType<IconProps>> = {
  github: IconGitHub,
  linkedin: IconLinkedIn,
  instagram: IconInstagram,
};

/** Іконки GitHub, LinkedIn та Instagram людини; без жодного посилання не рендерить нічого. */
export function ProfileLinks({ links, className = "" }: { links: Partial<Record<ProfileLinkKey, string>>; className?: string }) {
  const present = PROFILE_LINKS.filter((link) => links[link.key]);
  if (present.length === 0) return null;
  return (
    <ul className={`flex items-center gap-2 ${className}`} aria-label="Посилання">
      {present.map((link) => {
        const Icon = ICONS[link.key];
        const name = links[link.key] as string;
        // GitHub з'являється в профілі лише після того, як його підтвердив сам GitHub.
        const verified = link.key === "github";
        const label = `${link.label}: ${name}${verified ? ", підтверджено GitHub" : ""}`;
        return (
          <li key={link.key}>
            <a
              href={link.href(name)}
              target="_blank"
              rel="me noopener noreferrer"
              title={label}
              aria-label={label}
              className="relative inline-flex size-9 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              <Icon className="size-4" />
              {verified && (
                <span className="absolute -right-0.5 -bottom-0.5 inline-flex size-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-bg)]">
                  <IconCheck className="size-2.5" />
                </span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
