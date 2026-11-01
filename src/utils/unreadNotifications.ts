import { getCachedUsername } from "./currentUser";

const counts = new Map<string, number>();
const listeners = new Set<(count: number) => void>();

export function getUnreadNotificationCount(): number {
  const username = getCachedUsername();
  return username ? counts.get(username) || 0 : 0;
}

export function updateUnreadNotifications(count: number, username: string): void {
  if (!username || !Number.isSafeInteger(count) || count < 0) return;
  counts.set(username, count);
  if (username !== getCachedUsername()) return;
  listeners.forEach((listener) => listener(count));
}

export function subscribeUnreadNotifications(listener: (count: number) => void): () => void {
  listeners.add(listener);
  listener(getUnreadNotificationCount());
  return () => { listeners.delete(listener); };
}
