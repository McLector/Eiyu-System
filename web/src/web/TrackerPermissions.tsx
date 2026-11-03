import { useQueryClient } from '@tanstack/react-query';
import { trackerKey, useTrackerAccess } from '../store/tracker';
import { TrackerConsent } from './TrackerConsent';
import RetentionNotice from './RetentionNotice';

/** The two optional tracker purposes in Profile, each with its own notice and server-confirmed grant or withdrawal. Reads only; never writes on mount. */
export default function TrackerPermissions({ userId, audience }: { userId: string; audience?: 'teen' | 'adult' }) {
  const qc = useQueryClient();
  const query = useTrackerAccess(userId);
  const access = query.data;
  if (query.isPending) return null;
  if (!access || access.revision.userId !== userId) {
    return <p role="status">Tracker permission settings are unavailable. Your basic quests are not affected.</p>;
  }
  const stale = () => void qc.invalidateQueries({ queryKey: trackerKey(userId) });
  const changed = (next: typeof access) => { qc.setQueryData(trackerKey(userId), next); };
  return <div style={{ display: 'grid', gap: 12 }} aria-label="Tracker permissions" role="group">
    <RetentionNotice key={`${userId}-retention`} userId={userId} />
    <TrackerConsent key={`${userId}-custom`} userId={userId} access={access} purpose="custom-tracker" audience={audience} onChanged={changed} onStale={stale} />
    <TrackerConsent key={`${userId}-fitness`} userId={userId} access={access} purpose="fitness-tracking" audience={audience} onChanged={changed} onStale={stale} />
  </div>;
}
