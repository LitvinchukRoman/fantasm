/** Байти публічного VAPID-ключа. Браузер приймає їх у subscribe, не рядок. */
export function vapidKeyBytes(publicKey: string): Uint8Array<ArrayBuffer> {
  const padded = publicKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (publicKey.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

interface PushBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function subscriptionBody(sub: PushSubscription): PushBody | null {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

async function send(method: "POST" | "DELETE", body: unknown): Promise<boolean> {
  const response = await fetch("/api/me/push-subscriptions", {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.ok || response.status === 204;
}

/** Повертає публічний ключ або null, якщо сервер сповіщення не віддає. */
export async function vapidPublicKey(): Promise<string | null> {
  const response = await fetch("/api/push/vapid-public-key", { headers: { accept: "application/json" } });
  if (!response.ok) return null;
  const body = (await response.json()) as { publicKey?: unknown };
  return typeof body.publicKey === "string" && body.publicKey ? body.publicKey : null;
}

/** Записує поточну підписку цього браузера. Дозвіл уже має бути наданий. */
export async function ensureSubscription(publicKey: string): Promise<boolean> {
  const registration = await navigator.serviceWorker.register("/sw.js");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKeyBytes(publicKey),
    });
  }
  const body = subscriptionBody(subscription);
  return body !== null && send("POST", body);
}

export async function clearSubscription(): Promise<boolean> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return true;
  const endpoint = subscription.endpoint;
  const forgotten = await send("DELETE", { endpoint });
  if (!forgotten) return false;
  await subscription.unsubscribe();
  return true;
}
