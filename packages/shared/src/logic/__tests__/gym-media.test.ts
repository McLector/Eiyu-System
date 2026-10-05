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
  it('is per-user, per-routine, with the extension from the type', () => {
    expect(gymMediaPath('u1', 'r1', 'image/gif', 'abc')).toBe('u1/r1/abc.gif');
    expect(gymMediaPath('u1', 'r1', 'video/mp4', 'abc')).toBe('u1/r1/abc.mp4');
  });
});
