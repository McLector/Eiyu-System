import { supabase } from '../supabase/client';
import { GYM_BUCKET, gymMediaPath, type GymMediaMime } from '../logic/gym-media';
import { newRequestId } from '../logic/request-id';

/** Upload an already validated file body (a File/Blob on web, an ArrayBuffer on a phone) to this user's folder. */
export async function uploadGymMediaBody(userId: string, routineId: string, body: Blob | ArrayBuffer | Uint8Array, mime: GymMediaMime) {
  const path = gymMediaPath(userId, routineId, mime, newRequestId());
  const { error } = await supabase.storage.from(GYM_BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (error) throw error;
  return { path, mime };
}
export async function deleteGymMedia(path: string) {
  const { error } = await supabase.storage.from(GYM_BUCKET).remove([path]);
  if (error) throw error;
}
/** A 5-minute signed URL; callers renew it every 4 minutes. */
export async function signGymMedia(path: string) {
  const { data, error } = await supabase.storage.from(GYM_BUCKET).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
