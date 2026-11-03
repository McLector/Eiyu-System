import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  TRACKER_WRITE_MARKER_MAX_AGE_MS, clearTrackerWriteMarker, decodeTrackerWriteMarker, encodeTrackerWriteMarker, markerAccess,
  readTrackerWriteMarker, saveTrackerWriteMarker, trackerWriteMarkerKey,
} from '../tracker-write-marker';
import { noGrant, trackerAccess } from '@/test-support/tracker-fixtures';

const OWNER = 'owner-a';
const NOW = 1_800_000_000_000;
const stored = (over: Record<string, unknown> = {}) => JSON.stringify({
  userId: OWNER, revision: trackerAccess().revision, canWriteBasic: true, canWriteCustom: true, savedAt: NOW, ...over,
});

beforeEach(async () => { await AsyncStorage.clear(); });
afterEach(() => { jest.restoreAllMocks(); });

describe('what is stored', () => {
  it('keeps only the revision and the two write bits, never consent or authority details', () => {
    const saved = JSON.parse(encodeTrackerWriteMarker(trackerAccess(), NOW));
    expect(Object.keys(saved).sort()).toEqual(['canWriteBasic', 'canWriteCustom', 'revision', 'savedAt', 'userId']);
    expect(saved).toEqual({ userId: OWNER, revision: trackerAccess().revision, canWriteBasic: true, canWriteCustom: true, savedAt: NOW });
  });
  it('records a missing custom grant and a paused account as they were read', () => {
    expect(JSON.parse(encodeTrackerWriteMarker(noGrant(), NOW)).canWriteCustom).toBe(false);
    expect(JSON.parse(encodeTrackerWriteMarker(trackerAccess({ canWriteBasic: false }), NOW)).canWriteBasic).toBe(false);
  });
  it('is stored per account', () => {
    expect(trackerWriteMarkerKey('owner-a')).not.toBe(trackerWriteMarkerKey('owner-b'));
  });
});

describe('reading it back', () => {
  it('round-trips', () => {
    expect(decodeTrackerWriteMarker(stored(), OWNER)).toEqual({
      userId: OWNER, revision: trackerAccess().revision, canWriteBasic: true, canWriteCustom: true, savedAt: NOW,
    });
  });
  it.each([
    ['nothing stored', null],
    ['an empty value', ''],
    ['broken JSON', '{'],
    ['an array', '[]'],
    ['JSON null', 'null'],
    ['another account', stored({ userId: 'owner-b' })],
    ['a revision of another account', stored({ revision: trackerAccess({}, 'owner-b').revision })],
    ['a missing revision', stored({ revision: undefined })],
    ['a negative revision number', stored({ revision: { ...trackerAccess().revision, consentVersion: -1 } })],
    ['a text basic bit', stored({ canWriteBasic: 'true' })],
    ['a missing custom bit', stored({ canWriteCustom: undefined })],
    ['a text date', stored({ savedAt: 'today' })],
    ['a null date', stored({ savedAt: null })],
  ])('refuses %s', (_name, raw) => {
    expect(decodeTrackerWriteMarker(raw, OWNER)).toBeNull();
  });
});

describe('what a marker allows', () => {
  const marker = (over: Record<string, unknown> = {}) => decodeTrackerWriteMarker(stored(over), OWNER);

  it('gives the revision and write bits, with nothing that looks like consent', () => {
    expect(markerAccess(marker(), OWNER, NOW)).toEqual({ revision: trackerAccess().revision, canWriteBasic: true, canWriteCustom: true });
  });
  it('passes on a missing custom grant', () => {
    expect(markerAccess(marker({ canWriteCustom: false }), OWNER, NOW)?.canWriteCustom).toBe(false);
  });
  it('allows nothing when none is stored', () => {
    expect(markerAccess(null, OWNER, NOW)).toBeNull();
  });
  it('allows nothing when the account was paused', () => {
    expect(markerAccess(marker({ canWriteBasic: false }), OWNER, NOW)).toBeNull();
  });
  it('allows nothing for another account, or for no account', () => {
    expect(markerAccess(marker(), 'owner-b', NOW)).toBeNull();
    expect(markerAccess(marker(), undefined, NOW)).toBeNull();
  });
  it('lasts until just before the maximum age, then allows nothing', () => {
    expect(markerAccess(marker(), OWNER, NOW + TRACKER_WRITE_MARKER_MAX_AGE_MS - 1)).not.toBeNull();
    expect(markerAccess(marker(), OWNER, NOW + TRACKER_WRITE_MARKER_MAX_AGE_MS)).toBeNull();
  });
  it('allows nothing when it claims to come from the future, because its age cannot be known', () => {
    expect(markerAccess(marker(), OWNER, NOW - 1)).toBeNull();
  });
});

describe('device storage', () => {
  it('saves and reads back for the same account', async () => {
    await saveTrackerWriteMarker(trackerAccess(), NOW);
    expect(await readTrackerWriteMarker(OWNER)).toEqual(expect.objectContaining({ userId: OWNER, savedAt: NOW }));
    expect(await readTrackerWriteMarker('owner-b')).toBeNull();
  });
  it('replaces an earlier grant when a later read shows a pause', async () => {
    await saveTrackerWriteMarker(trackerAccess(), NOW);
    await saveTrackerWriteMarker(trackerAccess({ canWriteBasic: false }), NOW + 1);
    const marker = await readTrackerWriteMarker(OWNER);
    expect(markerAccess(marker, OWNER, NOW + 1)).toBeNull();
  });
  it('clears only that account', async () => {
    await saveTrackerWriteMarker(trackerAccess(), NOW);
    await saveTrackerWriteMarker(trackerAccess({}, 'owner-b'), NOW);
    await clearTrackerWriteMarker(OWNER);
    expect(await readTrackerWriteMarker(OWNER)).toBeNull();
    expect(await readTrackerWriteMarker('owner-b')).not.toBeNull();
  });
  it('treats a storage failure as no marker, and never throws', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(readTrackerWriteMarker(OWNER)).resolves.toBeNull();
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
    await expect(saveTrackerWriteMarker(trackerAccess(), NOW)).resolves.toBeUndefined();
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk'));
    await expect(clearTrackerWriteMarker(OWNER)).resolves.toBeUndefined();
  });
});
