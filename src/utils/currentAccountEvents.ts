// Synchronous invalidation only: never publish credentials, usernames or private data.
export type CurrentAccountChange = 'changed' | 'signed-out';
const listeners = new Set<(reason: CurrentAccountChange) => void>();

export function subscribeCurrentAccount(listener: (reason: CurrentAccountChange) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function invalidateCurrentAccount(reason: CurrentAccountChange): void {
  for (const listener of [...listeners]) {
    try { listener(reason); } catch {
      // An observer failure must not prevent logout or another observer's cleanup.
    }
  }
}
