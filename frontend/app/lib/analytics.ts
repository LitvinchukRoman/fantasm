import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

export type ClientEventName = "page_view" | "ui.click" | "feed.filter";

export interface ClientEvent {
  name: ClientEventName;
  path?: string;
  props?: Record<string, string>;
}

const queue: ClientEvent[] = [];
let timer: number | undefined;

/** Paths the operator walks must not count as growth. */
export function shouldTrackPath(path: string): boolean {
  return path !== "/moderation" && !path.startsWith("/moderation/") && path !== "/admin" && !path.startsWith("/admin/");
}

/** The first view of a visit may carry a referrer host and campaign tags. Later views do not. */
export function pageViewProps(input: {
  path: string;
  search: string;
  host: string;
  referrer: string;
  first: boolean;
}): ClientEvent {
  const props: Record<string, string> = {};
  if (input.first) {
    if (input.referrer) {
      try {
        const ref = new URL(input.referrer);
        if (ref.host && ref.host !== input.host) props.referrer = ref.host;
      } catch {
        // A malformed referrer is dropped rather than sent raw.
      }
    }
    const query = new URLSearchParams(input.search);
    for (const key of ["utm_source", "utm_medium", "utm_campaign"] as const) {
      const value = query.get(key);
      if (value) props[key] = value.slice(0, 80);
    }
  }
  return { name: "page_view", path: input.path, props };
}

export function buildBatch(events: ClientEvent[]): string {
  return JSON.stringify({ events: events.slice(0, 10) });
}

export function track(name: ClientEventName, props?: Record<string, string>, path?: string) {
  if (typeof window === "undefined") return;
  queue.push({ name, path: path ?? window.location.pathname, ...(props ? { props } : {}) });
  if (queue.length >= 10) {
    flush();
    return;
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(flush, 400);
}

export function flush() {
  if (typeof window === "undefined" || queue.length === 0) return;
  const body = buildBatch(queue.splice(0, 10));
  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
}

export function usePageViews() {
  const location = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (!shouldTrackPath(location.pathname)) return;
    const event = pageViewProps({
      path: location.pathname,
      search: location.search,
      host: window.location.host,
      referrer: document.referrer,
      first: first.current,
    });
    first.current = false;
    track("page_view", event.props, event.path);
  }, [location.key, location.pathname, location.search]);
}
