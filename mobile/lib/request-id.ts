/**
 * A fresh UUID for a write the server de-duplicates by request id (stage rewards, long quest saves).
 * Hermes has no `crypto.randomUUID`, so fall back to a v4-shaped id; uniqueness is all the server needs here.
 */
export function newRequestId(): string {
  const platform = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (platform?.randomUUID) return platform.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const digit = Math.floor(Math.random() * 16);
    return (char === 'x' ? digit : (digit & 0x3) | 0x8).toString(16);
  });
}
