import * as ImagePicker from 'expo-image-picker';
import { checkGymMediaSize, gymMediaMime, uploadGymMediaBody, validateGymMediaBytes, type GymMediaMime } from '@eiyu/shared';

export interface PickedGymMedia { uri: string; mime: GymMediaMime; name: string }

const nameOf = (uri: string) => decodeURIComponent(uri.split('/').pop() ?? 'demonstration');
const mimeFromName = (name: string) => (/\.gif$/i.test(name) ? 'image/gif' : /\.mp4$/i.test(name) ? 'video/mp4' : undefined);

/** Open the system picker for one GIF or MP4. Null means the user backed out; anything else wrong throws with the web wording. */
export async function pickGymMedia(): Promise<PickedGymMedia | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: false, quality: 1 });
  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return null;
  const name = asset.fileName ?? nameOf(asset.uri);
  const mime = gymMediaMime(asset.mimeType ?? mimeFromName(asset.fileName ?? asset.uri));
  if (asset.fileSize !== undefined) checkGymMediaSize(asset.fileSize);
  return { uri: asset.uri, mime, name };
}

/**
 * Read the picked file into memory (an ArrayBuffer, which the storage client sends as the raw body; a Blob built from a
 * file uri is unreliable in React Native), apply the shared checks, then upload it to this user's folder.
 */
export async function uploadPickedGymMedia(userId: string, routineId: string, media: PickedGymMedia) {
  let bytes: ArrayBuffer;
  try {
    const response = await fetch(media.uri);
    if (!response.ok) throw new Error('unreadable');
    bytes = await response.arrayBuffer();
  } catch {
    throw new Error('The selected file could not be read. Pick it again.');
  }
  const mime = validateGymMediaBytes(bytes, media.mime);
  return uploadGymMediaBody(userId, routineId, bytes, mime);
}
