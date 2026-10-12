import { useSyncExternalStore } from "react";

/**
 * Згода на аналітику. Необхідні cookies (сесія, вхід, сам цей вибір) згоди не потребують;
 * Google Analytics ставить свої лише після «granted». Рекламних сигналів сайт не вмикає ніколи.
 * Ім'я й формат cookie читає ще й інлайн-скрипт у root.tsx до завантаження gtag.js.
 */
export const CONSENT_COOKIE = "fantasm_consent";
export const CONSENT_PATTERN = /(?:^|;\s*)fantasm_consent=(granted|denied)/;
/** 6 місяців: після цього банер питає знову, як радять наглядові органи ЄС. */
const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;
const CHANGE_EVENT = "fantasm:consent";
const OPEN_EVENT = "fantasm:consent-open";

export type Consent = "granted" | "denied";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function readConsent(): Consent | null {
  const match = document.cookie.match(CONSENT_PATTERN);
  return match ? (match[1] as Consent) : null;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** undefined до гідрації (на сервері вибору не видно), далі null, поки людина не відповіла. */
export function useConsent(): Consent | null | undefined {
  return useSyncExternalStore(subscribe, readConsent, () => undefined);
}

export function saveConsent(value: Consent) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  window.gtag?.("consent", "update", { analytics_storage: value });
  if (value === "denied") removeAnalyticsCookies();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Відкликана згода має прибрати вже поставлені _ga, а не лише зупинити нові. */
function removeAnalyticsCookies() {
  const names = document.cookie
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
  const labels = location.hostname.split(".");
  // gtag з cookie_domain "auto" міг поставити cookie на батьківський домен (.naukma.com).
  const domains = ["", ...labels.slice(0, -1).map((_, i) => `; Domain=.${labels.slice(i).join(".")}`)];
  for (const name of names) {
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
  }
}

export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onConsentSettingsOpen(listener: () => void) {
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}
