import { copyTrackerRevision, TRACKER_ACCESS_MESSAGE, type TrackerRevision } from '../data/tracker-access';
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
const LOWER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/**
 * Where an upload goes: `<owner>/<routine>/<age>-<consent>-<authority>/<object>.<gif|mp4>`. The revision folder is the
 * captured tracker revision, so Storage can refuse a body that was started under a permission that has since changed.
 */
export function gymMediaPath(userId: string, routineId: string, mime: GymMediaMime, id: string, expected: TrackerRevision): string {
  const revision = copyTrackerRevision(expected);
  if (revision.userId !== userId || !LOWER_UUID.test(routineId) || !LOWER_UUID.test(id)) throw new Error(TRACKER_ACCESS_MESSAGE);
  return `${userId}/${routineId}/${revision.ageVersion}-${revision.consentVersion}-${revision.authorityVersion}/${id}.${mime === 'image/gif' ? 'gif' : 'mp4'}`;
}
