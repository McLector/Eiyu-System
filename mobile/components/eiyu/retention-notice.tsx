import {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {fetchRetentionNotice, type RetentionNotice as Notice} from '@eiyu/shared';
import {AppText} from '@/components/ui/app-text';
import {fonts} from '@/constants/eiyu-theme';
import {useTokens} from '@/contexts/theme-store';

const WORDS = {
  'custom-tracker': {records: 'custom quest records', turnOn: 'custom tracking'},
  'fitness-tracking': {records: 'Gym records', turnOn: 'fitness tracking'},
} as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Formatted by hand so the date never shifts with the device time zone or a missing Intl locale.
function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Profile reminder that saved custom or Gym records are about to be removed. Reads only; a failed read shows nothing. */
export function RetentionNotice({userId}: {userId: string}) {
  const t = useTokens();
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    let live = true;
    setNotices([]);
    fetchRetentionNotice(userId).then(rows => { if (live) setNotices(rows.filter(row => row.reminded)); }).catch(() => undefined);
    return () => { live = false; };
  }, [userId]);
  if (notices.length === 0) return null;
  const body = {fontFamily: fonts.body, color: t['muted-flat'], fontSize: 13, lineHeight: 20};
  return <View style={styles.container}>
    {notices.map(notice => <AppText key={notice.purpose} selectable accessibilityRole="text" style={body}>
      {`Your ${WORDS[notice.purpose].records} will be removed on ${longDate(notice.removalDueOn)} unless you turn ${WORDS[notice.purpose].turnOn} back on.`}
    </AppText>)}
  </View>;
}

const styles = StyleSheet.create({container: {gap: 6}});
