import { GYM_MEDIA_MAX_BYTES, gymMediaMime, gymMediaPath, validateGymMediaBytes } from '../gym-media';

const gif = (extra = 0) => { const b = new Uint8Array(12 + extra); b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); return b; };
const mp4 = (extra = 0) => { const b = new Uint8Array(12 + extra); b.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70], 0); return b; };

describe('gymMediaMime', () => {
  it('accepts GIF and MP4 only', () => {
    expect(gymMediaMime('image/gif')).toBe('image/gif');
    expect(gymMediaMime('video/mp4')).toBe('video/mp4');
    for (const bad of ['image/png', 'video/webm', 'text/plain', '', undefined, null]) expect(() => gymMediaMime(bad as string)).toThrow('Choose a GIF or MP4 file.');
  });
});

describe('validateGymMediaBytes', () => {
  it('passes a GIF87a/GIF89a and an MP4 ftyp header', () => {
    expect(validateGymMediaBytes(gif(), 'image/gif')).toBe('image/gif');
    const old = gif(); old[4] = 0x37;
    expect(validateGymMediaBytes(old, 'image/gif')).toBe('image/gif');
    expect(validateGymMediaBytes(mp4(), 'video/mp4')).toBe('video/mp4');
  });
  it('accepts an ArrayBuffer too (what fetch gives on a phone)', () => {
    expect(validateGymMediaBytes(gif().buffer, 'image/gif')).toBe('image/gif');
  });
  it('rejects an empty file and one over 20 MiB', () => {
    expect(() => validateGymMediaBytes(new Uint8Array(0), 'image/gif')).toThrow('between 1 byte and 20 MiB');
    expect(GYM_MEDIA_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(() => validateGymMediaBytes(gif(GYM_MEDIA_MAX_BYTES), 'image/gif')).toThrow('between 1 byte and 20 MiB');
  });
  it('rejects contents that do not match the declared type', () => {
    expect(() => validateGymMediaBytes(mp4(), 'image/gif')).toThrow('File contents do not match a GIF or MP4.');
    expect(() => validateGymMediaBytes(gif(), 'video/mp4')).toThrow('File contents do not match a GIF or MP4.');
    expect(() => validateGymMediaBytes(new Uint8Array([1, 2, 3]), 'image/gif')).toThrow('do not match');
  });
  it('rejects an unsupported declared type before looking at bytes', () => {
    expect(() => validateGymMediaBytes(gif(), 'image/png')).toThrow('Choose a GIF or MP4 file.');
  });
});

describe('gymMediaPath', () => {
  const OWNER = 'da230000-0000-4000-8000-000000000001';
  const ROUTINE = 'da230000-0000-4000-8000-0000000000a1';
  const OBJECT = 'da230000-0000-4000-8000-0000000000b1';
  const revision = { userId: OWNER, ageVersion: 1, consentVersion: 22, authorityVersion: 3 };

  it('is per-user, per-routine and per-revision, with the extension from the type', () => {
    expect(gymMediaPath(OWNER, ROUTINE, 'image/gif', OBJECT, revision)).toBe(`${OWNER}/${ROUTINE}/1-22-3/${OBJECT}.gif`);
    expect(gymMediaPath(OWNER, ROUTINE, 'video/mp4', OBJECT, revision)).toBe(`${OWNER}/${ROUTINE}/1-22-3/${OBJECT}.mp4`);
  });
  it('moves to another folder when any one revision moves', () => {
    const paths = [revision, { ...revision, ageVersion: 2 }, { ...revision, consentVersion: 23 }, { ...revision, authorityVersion: 4 }]
      .map(r => gymMediaPath(OWNER, ROUTINE, 'image/gif', OBJECT, r));
    expect(new Set(paths).size).toBe(4);
  });
  it('refuses a revision of another owner', () => {
    expect(() => gymMediaPath(OWNER, ROUTINE, 'image/gif', OBJECT, { ...revision, userId: 'da230000-0000-4000-8000-000000000002' })).toThrow();
  });
  it('refuses an invalid revision, and ids that are not lowercase UUIDs', () => {
    expect(() => gymMediaPath(OWNER, ROUTINE, 'image/gif', OBJECT, undefined as never)).toThrow();
    expect(() => gymMediaPath(OWNER, ROUTINE, 'image/gif', OBJECT, { ...revision, consentVersion: -1 })).toThrow();
    for (const bad of ['', 'r1', '../x', ROUTINE.toUpperCase(), `${ROUTINE}/x`]) {
      expect(() => gymMediaPath(OWNER, bad, 'image/gif', OBJECT, revision)).toThrow();
      expect(() => gymMediaPath(OWNER, ROUTINE, 'image/gif', bad, revision)).toThrow();
    }
  });
});
