import { newRequestId } from '../request-id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newRequestId', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else delete (globalThis as { crypto?: unknown }).crypto;
  });

  it('returns a UUID the database request-id columns accept', () => {
    expect(newRequestId()).toMatch(UUID_V4);
  });

  it('uses the platform generator when there is one', () => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => 'platform-id' } });
    expect(newRequestId()).toBe('platform-id');
  });

  it('still returns a valid, unique UUID when the device has no crypto global (Hermes)', () => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const ids = new Set(Array.from({ length: 500 }, () => newRequestId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('falls back when crypto exists without randomUUID', () => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    expect(newRequestId()).toMatch(UUID_V4);
  });
});
