// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('@eiyu/shared', async importOriginal => ({ ...await importOriginal<object>(), uploadGymMediaBody: mocks.upload }));

import { uploadGymMedia } from '../gym-media';

const REVISION = { userId: 'owner-a', ageVersion: 2, consentVersion: 3, authorityVersion: 1 };
beforeEach(() => mocks.upload.mockReset().mockResolvedValue({ path: 'p', mime: 'image/gif' }));

it('refuses a file that is not GIF or MP4 before any upload, with the captured revision untouched', async () => {
  await expect(uploadGymMedia('owner-a', 'routine', new File(['x'], 'a.txt', { type: 'text/plain' }), REVISION)).rejects.toThrow('GIF or MP4');
  expect(mocks.upload).not.toHaveBeenCalled();
});

it('passes the captured revision to the shared upload unchanged', async () => {
  class FakeImage { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_: string) { queueMicrotask(() => this.onload?.()); } }
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
  const file = new File([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0])], 'a.gif', { type: 'image/gif' });
  const head = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
  Object.defineProperty(file, 'slice', { value: () => ({ arrayBuffer: async () => head.buffer }) });
  await uploadGymMedia('owner-a', 'routine', file, REVISION);
  expect(mocks.upload).toHaveBeenCalledWith('owner-a', 'routine', file, 'image/gif', REVISION);
  vi.unstubAllGlobals();
});
