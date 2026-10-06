import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { formatError, signGymMedia, type GymExercise } from '@eiyu/shared';

import { PlayIcon, VolumeIcon, VolumeOffIcon } from '@/components/eiyu/icons';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/components/ui/use-reduced-motion';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

/** The signed link lasts five minutes; it is renewed after four, like web. */
const RENEW_MS = 240_000;

interface Props {
  exercise: GymExercise;
  canEdit: boolean;
  onEdit: () => void;
  /** Only the card being looked at reads its media; the neighbours in the pager wait. */
  active: boolean;
}

/** Plays muted so a card never blares when it appears; the speaker button turns the sound on for this card only. */
function Mp4({ url, label }: { url: string; label: string }) {
  const t = useTokens();
  const reduced = useReducedMotion();
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(url, p => {
    p.loop = true;
    p.muted = true;
    // Other apps' audio (the user's music) is lowered while the sound is on, never paused.
    p.audioMixingMode = 'duckOthers';
    if (!reduced) p.play();
  });
  // The setting arrives after the first render; if it says reduce motion, stop what already started.
  useEffect(() => { if (reduced) player.pause(); }, [reduced, player]);
  useEffect(() => { player.muted = muted; }, [muted, player]);
  const Icon = muted ? VolumeOffIcon : VolumeIcon;
  return (
    <>
      <VideoView player={player} nativeControls contentFit="contain" accessibilityLabel={label} style={styles.media} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'}
        accessibilityState={{ checked: !muted }}
        hitSlop={4}
        onPress={() => setMuted(value => !value)}
        style={[styles.sound, { backgroundColor: t['page-flat'], borderColor: t['accent-border'] }]}>
        <Icon size={20} color={t['accent-text']} />
      </Pressable>
    </>
  );
}

/** A GIF or an MP4 from a (signed or local) link, filling a 16:9 box. */
export function MediaView({ url, mime, label, onError }: { url: string; mime: 'image/gif' | 'video/mp4' | null; label: string; onError?: () => void }) {
  const t = useTokens();
  return (
    <View style={[styles.box, { borderColor: t['glass-border'], backgroundColor: t.track }]}>
      {mime === 'image/gif' ? (
        <Image accessibilityLabel={label} source={{ uri: url }} resizeMode="contain" style={styles.media} onError={onError} />
      ) : (
        <Mp4 url={url} label={label} />
      )}
    </View>
  );
}

/** The video guide on an exercise card: a GIF or an MP4 from the private bucket, with its link renewed before it lapses. */
export function ExerciseMedia({ exercise, canEdit, onEdit, active }: Props) {
  const t = useTokens();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const path = exercise.media_path;

  useEffect(() => {
    let current = true;
    setUrl(null);
    setError(null);
    if (!path || !active) return () => { current = false; };
    const renew = () => {
      void signGymMedia(path)
        .then(value => { if (current) { setUrl(value); setError(null); } })
        .catch(err => { if (current) setError(formatError(err)); });
    };
    renew();
    const timer = setInterval(renew, RENEW_MS);
    return () => { current = false; clearInterval(timer); };
  }, [path, active, retry]);

  const box = [styles.box, { borderColor: t['glass-border'], backgroundColor: t.track }];
  if (!path) {
    return (
      <View style={[box, styles.empty]}>
        <PlayIcon size={20} color={t['dim-flat']} />
        <Text style={[styles.text, { color: t['dim-flat'], fontFamily: fonts.body }]}>No video guide attached.</Text>
        {canEdit ? <Button variant="secondary" label="Attach a video guide" onPress={onEdit} /> : null}
      </View>
    );
  }
  if (error) {
    return (
      <View style={[box, styles.empty]}>
        <Text accessibilityRole="alert" style={[styles.text, { color: t.danger, fontFamily: fonts.body }]}>{error}</Text>
        <Button variant="secondary" label="Reload video guide" onPress={() => setRetry(n => n + 1)} />
      </View>
    );
  }
  if (!url) {
    return (
      <View style={[box, styles.empty]}>
        <Text accessibilityRole="progressbar" accessibilityLiveRegion="polite" style={[styles.text, { color: t['dim-flat'], fontFamily: fonts.body }]}>Loading video guide…</Text>
      </View>
    );
  }
  return <MediaView url={url} mime={exercise.media_mime} label={`${exercise.name} video guide`} onError={() => setError('The guide could not load. Reload to refresh access.')} />;
}

const styles = StyleSheet.create({
  box: { width: '100%', aspectRatio: 16 / 9, borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  media: { width: '100%', height: '100%' },
  sound: { position: 'absolute', top: 8, right: 8, width: 44, height: 44, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center', opacity: 0.92 },
  text: { fontSize: 13, textAlign: 'center' },
});
