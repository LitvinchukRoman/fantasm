import { data } from "react-router";
import { ApiError, decideModeration, getModerationHistory, getModerationQueue, getModerationReports, routeApi } from "~/lib/api.server";
import type { ModerationHistoryItem, ModerationReport, QueueItem } from "~/lib/api-types";

export type ModerationData = {
  tab: "history" | "queue";
  items: QueueItem[];
  nextCursor?: string | null;
  history: ModerationHistoryItem[];
  reports: ModerationReport[];
  reportsFor: string;
};

export async function moderationData(request: Request): Promise<ModerationData> {
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  if (url.searchParams.get("tab") === "history") {
    const history = await routeApi(getModerationHistory(request, cursor));
    return { tab: "history", items: [], nextCursor: history.nextCursor, history: history.items, reports: [], reportsFor: "" };
  }
  const reportsFor = url.searchParams.get("reports") ?? "";
  const queue = await routeApi(getModerationQueue(request, url.searchParams.get("state") ?? undefined, cursor));
  const reports = reportsFor ? (await routeApi(getModerationReports(request, reportsFor))).items : [];
  return { tab: "queue", items: queue.items, nextCursor: queue.nextCursor, history: [], reports, reportsFor };
}

export async function moderate(request: Request) {
  const form = await request.formData();
  try {
    await decideModeration(request, String(form.get("id")), String(form.get("decision")), String(form.get("note") || "") || undefined);
    return data({ ok: true });
  } catch (error) {
    if (error instanceof ApiError) return data(error.body, { status: error.status });
    throw error;
  }
}
