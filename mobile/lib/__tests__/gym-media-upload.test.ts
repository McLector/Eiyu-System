const mockShared = { uploadGymMediaBody: jest.fn() };
jest.doMock('@eiyu/shared', () => ({ ...jest.requireActual('@eiyu/shared'), ...mockShared }));
const picker = jest.requireMock('expo-image-picker') as { launchImageLibraryAsync: jest.Mock };
const { pickGymMedia, uploadPickedGymMedia } = require('../gym-media-upload') as typeof import('../gym-media-upload');

const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0]);
const asset = (over: Record<string, unknown> = {}) => ({ uri: 'file:///cache/a.gif', mimeType: 'image/gif', fileSize: 42, fileName: 'a.gif', ...over });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
beforeEach(() => { jest.clearAllMocks(); });

describe('pickGymMedia', () => {
  it('asks the picker for images and videos and returns the chosen GIF', async () => {
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [asset()] });
    await expect(pickGymMedia()).resolves.toEqual({ uri: 'file:///cache/a.gif', mime: 'image/gif', name: 'a.gif' });
    expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: false }));
  });
  it('returns null when the user cancels', async () => {
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    await expect(pickGymMedia()).resolves.toBeNull();
  });
  it('rejects a photo or an unknown type with the web wording', async () => {
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [asset({ mimeType: 'image/jpeg' })] });
    await expect(pickGymMedia()).rejects.toThrow('Choose a GIF or MP4 file.');
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [asset({ mimeType: undefined, fileName: 'x.png' })] });
    await expect(pickGymMedia()).rejects.toThrow('Choose a GIF or MP4 file.');
  });
  it('infers the type from the extension when the picker gives none', async () => {
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [asset({ mimeType: undefined, uri: 'file:///c/clip.MP4', fileName: undefined })] });
    await expect(pickGymMedia()).resolves.toMatchObject({ mime: 'video/mp4', name: 'clip.MP4' });
  });
  it('rejects a file over 20 MiB before reading it', async () => {
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [asset({ fileSize: 21 * 1024 * 1024 })] });
    await expect(pickGymMedia()).rejects.toThrow('between 1 byte and 20 MiB');
  });
});

describe('uploadPickedGymMedia', () => {
  const picked = { uri: 'file:///cache/a.gif', mime: 'image/gif' as const, name: 'a.gif' };
  it('reads the file into memory, checks it and uploads the bytes to the user folder', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => GIF.buffer })) as unknown as typeof fetch;
    mockShared.uploadGymMediaBody.mockResolvedValueOnce({ path: 'u/r/id.gif', mime: 'image/gif' });
    await expect(uploadPickedGymMedia('u', 'r', picked)).resolves.toEqual({ path: 'u/r/id.gif', mime: 'image/gif' });
    expect(globalThis.fetch).toHaveBeenCalledWith('file:///cache/a.gif');
    expect(mockShared.uploadGymMediaBody).toHaveBeenCalledWith('u', 'r', GIF.buffer, 'image/gif');
  });
  it('refuses bytes that are not what the type says, without uploading', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array(12).buffer })) as unknown as typeof fetch;
    await expect(uploadPickedGymMedia('u', 'r', picked)).rejects.toThrow('do not match');
    expect(mockShared.uploadGymMediaBody).not.toHaveBeenCalled();
  });
  it('says so when the file cannot be read', async () => {
    globalThis.fetch = jest.fn(async () => { throw new Error('ENOENT'); }) as unknown as typeof fetch;
    await expect(uploadPickedGymMedia('u', 'r', picked)).rejects.toThrow('could not be read');
    globalThis.fetch = jest.fn(async () => ({ ok: false })) as unknown as typeof fetch;
    await expect(uploadPickedGymMedia('u', 'r', picked)).rejects.toThrow('could not be read');
  });
  it('passes an upload failure on', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => GIF.buffer })) as unknown as typeof fetch;
    mockShared.uploadGymMediaBody.mockRejectedValueOnce(new Error('Payload too large'));
    await expect(uploadPickedGymMedia('u', 'r', picked)).rejects.toThrow('Payload too large');
  });
});
