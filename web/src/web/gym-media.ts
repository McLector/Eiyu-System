import { checkGymMediaSignature, checkGymMediaSize, gymMediaMime, uploadGymMediaBody, type GymMediaMime } from '@eiyu/shared';

export { GYM_BUCKET, deleteGymMedia, signGymMedia } from '@eiyu/shared';

/** The size, type and signature rules are shared with the phone; only the "can this browser decode it" step lives here. */
export async function validateGymMedia(file: File): Promise<GymMediaMime> {
  checkGymMediaSize(file.size);
  const mime = gymMediaMime(file.type);
  checkGymMediaSignature(new Uint8Array(await file.slice(0, 12).arrayBuffer()), mime);
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const media = mime === 'image/gif' ? new Image() : document.createElement('video');
      const timeout = window.setTimeout(() => { dispose(); reject(new Error('The demonstration could not be decoded. Try a shorter GIF or browser-compatible MP4.')); }, 15000);
      const dispose = () => { window.clearTimeout(timeout); media.onload = null; media.onerror = null; if (media instanceof HTMLVideoElement) { media.onloadedmetadata = null; media.removeAttribute('src'); media.load(); } };
      const ready = () => { dispose(); resolve(); };
      media.onerror = () => { dispose(); reject(new Error('This browser cannot play the selected file.')); };
      if (media instanceof HTMLVideoElement) { media.preload = 'metadata'; media.onloadedmetadata = ready; } else media.onload = ready;
      media.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
  return mime;
}
export async function uploadGymMedia(userId: string, routineId: string, file: File) {
  const mime = await validateGymMedia(file);
  return uploadGymMediaBody(userId, routineId, file, mime);
}
