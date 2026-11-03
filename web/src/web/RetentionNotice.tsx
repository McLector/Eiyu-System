import { useEffect, useState } from 'react';
import { fetchRetentionNotice, type RetentionNotice as Notice } from '@eiyu/shared';

const WORDS = {
  'custom-tracker': { records: 'custom quest records', turnOn: 'custom tracking' },
  'fitness-tracking': { records: 'Gym records', turnOn: 'fitness tracking' },
} as const;

function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Profile reminder that saved custom or Gym records are about to be removed. Reads only; a failed read shows nothing. */
export default function RetentionNotice({ userId }: { userId: string }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    let live = true;
    setNotices([]);
    fetchRetentionNotice(userId).then(rows => { if (live) setNotices(rows.filter(row => row.reminded)); }).catch(() => undefined);
    return () => { live = false; };
  }, [userId]);
  if (notices.length === 0) return null;
  return <div style={{ display: 'grid', gap: 6 }}>
    {notices.map(notice => <p key={notice.purpose} role="status">
      Your {WORDS[notice.purpose].records} will be removed on {longDate(notice.removalDueOn)} unless you turn {WORDS[notice.purpose].turnOn} back on.
    </p>)}
  </div>;
}
