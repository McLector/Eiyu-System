export const GYM_BUCKET = 'gym-exercise-media';
export const GYM_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export type GymMediaMime = 'image/gif' | 'video/mp4';

/** The declared type must be a GIF or an MP4. */
export function gymMediaMime(type: string | null | undefined): GymMediaMime {
  if (type !== 'image/gif' && type !== 'video/mp4') throw new Error('Choose a GIF or MP4 file.');
  return type;
}
export function checkGymMediaSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0 || size > GYM_MEDIA_MAX_BYTES) throw new Error('Choose a GIF or MP4 between 1 byte and 20 MiB.');
}
/** The first bytes must look like what the type claims: GIF87a/GIF89a, or an MP4 `ftyp` box. */
export function checkGymMediaSignature(head: Uint8Array, mime: GymMediaMime): void {
  const text = String.fromCharCode(...head.slice(0, 12));
  if (mime === 'image/gif' ? !/^GIF8[79]a/.test(text) : text.slice(4, 8) !== 'ftyp') throw new Error('File contents do not match a GIF or MP4.');
}
/** The platform-neutral checks, for a phone that holds the whole file in memory. Web checks the same rules on a File. */
export function validateGymMediaBytes(bytes: Uint8Array | ArrayBuffer, type: string | null | undefined): GymMediaMime {
  const mime = gymMediaMime(type);
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  checkGymMediaSize(data.byteLength);
  checkGymMediaSignature(data, mime);
  return mime;
}
export function gymMediaPath(userId: string, routineId: string, mime: GymMediaMime, id: string): string {
  return `${userId}/${routineId}/${id}.${mime === 'image/gif' ? 'gif' : 'mp4'}`;
}
