import { supabase } from '@eiyu/shared';
export const GYM_BUCKET = 'gym-exercise-media';
export async function validateGymMedia(file: File): Promise<'image/gif' | 'video/mp4'> {
  if (file.size === 0 || file.size > 20 * 1024 * 1024) throw new Error('Choose a GIF or MP4 between 1 byte and 20 MiB.');
  if (file.type !== 'image/gif' && file.type !== 'video/mp4') throw new Error('Choose a GIF or MP4 file.');
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = String.fromCharCode(...signature);
  if (file.type === 'image/gif' ? !/^GIF8[79]a/.test(text) : text.slice(4, 8) !== 'ftyp') throw new Error('File contents do not match a GIF or MP4.');
  const mime = file.type;
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
  const path = `${userId}/${routineId}/${crypto.randomUUID()}.${mime === 'image/gif' ? 'gif' : 'mp4'}`;
  const { error } = await supabase.storage.from(GYM_BUCKET).upload(path, file, { contentType: mime, upsert: false });
  if (error) throw error;
  return { path, mime };
}
export async function deleteGymMedia(path: string) {
  const { error } = await supabase.storage.from(GYM_BUCKET).remove([path]);
  if (error) throw error;
}
export async function signGymMedia(path: string) {
  const { data, error } = await supabase.storage.from(GYM_BUCKET).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
