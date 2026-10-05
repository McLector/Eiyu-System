import {
  GYM_COPY,
  LONG_QUEST_COPY,
  NAVIGATION_GUARD_COPY,
  WEEKLY_REVIEW_COPY,
  gymCleanupPending,
  gymSavedRefreshFailed,
  isGymCleanupNotice,
  stageNotice,
} from '../web-copy';

const everyLine = (): string[] => [
  ...Object.values(GYM_COPY),
  ...Object.values(LONG_QUEST_COPY),
  ...Object.values(NAVIGATION_GUARD_COPY),
  ...Object.values(WEEKLY_REVIEW_COPY),
  gymSavedRefreshFailed('Saved', new Error('x')),
  gymCleanupPending(new Error('x')),
  stageNotice('replayed'),
  stageNotice('completed'),
  stageNotice('undone'),
  stageNotice('unchanged'),
];

describe('web copy voice', () => {
  it('never leaks internal jargon to the user', () => {
    for (const line of everyLine()) {
      expect(line).not.toMatch(/reconcil|refresh failed|needs retry|payload|rpc|query/i);
    }
  });
  it('speaks as the System for every failure line', () => {
    const failures = [GYM_COPY.refreshFailed, WEEKLY_REVIEW_COPY.error, gymSavedRefreshFailed('Saved', new Error('x')), gymCleanupPending(new Error('x'))];
    for (const line of failures) expect(line).toMatch(/System|waiting for cleanup/);
  });
  it('uses a real ellipsis for loading lines, never three dots', () => {
    expect(GYM_COPY.loadingHistory.endsWith('…')).toBe(true);
    for (const line of everyLine()) expect(line).not.toMatch(/\.\.\./);
  });
  it('keeps a plain sentence ending on every state line', () => {
    for (const line of [GYM_COPY.emptyHistory, GYM_COPY.noRoutine, GYM_COPY.refreshFailed, GYM_COPY.uploadHeld]) expect(line).toMatch(/[.…]$/);
  });
});

describe('gym notices', () => {
  it('appends the cause after an em dash', () => {
    expect(gymSavedRefreshFailed('Routine saved', new Error('Offline'))).toBe("Routine saved. The System couldn't refresh — Offline");
    expect(gymCleanupPending(new Error('Offline'))).toBe('A demonstration file is still waiting for cleanup — Offline');
    expect(gymCleanupPending(new Error('Offline'), 'Routine deleted')).toBe('Routine deleted. A demonstration file is still waiting for cleanup — Offline');
  });
  it('recognises its own cleanup notices, so the retry button appears, and nothing else', () => {
    expect(isGymCleanupNotice(gymCleanupPending(new Error('x')))).toBe(true);
    expect(isGymCleanupNotice(gymCleanupPending(new Error('x'), 'Exercise removed'))).toBe(true);
    expect(isGymCleanupNotice('Routine saved.')).toBe(false);
    expect(isGymCleanupNotice(null)).toBe(false);
    expect(isGymCleanupNotice('')).toBe(false);
  });
  it('turns an unknown error into readable text rather than [object Object]', () => {
    expect(gymSavedRefreshFailed('Saved', { weird: true })).not.toMatch(/\[object Object\]/);
  });
});

describe('stage notices', () => {
  it('maps every receipt outcome to one short line', () => {
    expect(stageNotice('replayed')).toBe('Stage confirmed.');
    expect(stageNotice('completed')).toBe('Stage completed.');
    expect(stageNotice('undone')).toBe('Stage undone.');
    expect(stageNotice('unchanged')).toBe('Stage already saved.');
  });
});

describe('navigation guard', () => {
  it('says what is lost and what is kept', () => {
    expect(NAVIGATION_GUARD_COPY.leaveBody).toMatch(/lost/);
    expect(NAVIGATION_GUARD_COPY.leaveBody).toMatch(/last saved version/);
    expect(NAVIGATION_GUARD_COPY.busyBody).toMatch(/confirm the save/);
  });
});
