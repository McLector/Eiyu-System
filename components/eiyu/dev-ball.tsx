/**
 * Dev assistive tool (improvement-pass #10): a __DEV__-only floating,
 * draggable ball that opens a menu of one-tap testing actions. Returns null
 * outside dev builds, so production bundles carry nothing.
 *
 * Tap = open menu. Drag = reposition (snaps to nearest horizontal edge).
 * Add new tools by appending to the TOOLS list inside DevBallInner.
 */

import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { fonts } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useEiyu } from '@/contexts/eiyu-store';
import { AI_SUGGESTIONS_STORAGE_KEY } from '@/lib/ai';
import { completeHabit } from '@/lib/completions';
import { addUtcDays, mondayOfWeek, startOfUtcDay, toDateKey } from '@/lib/date-utils';
import { createHabit, HabitInput } from '@/lib/habits';
import { supabase } from '@/lib/supabase';
import { CompletionKind } from '@/types/database';
import { Difficulty, QuestType, Stat } from '@/types/eiyu';

const BALL_SIZE = 52;
const EDGE = 12;

const STATS: Stat[] = ['STR', 'INT', 'DEX', 'WIS', 'CHA'];
const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const HABIT_SEEDS = [
  'Code for 2 hours',
  'Read 30 pages',
  'Morning run',
  'Practice guitar',
  'Meditate 10 min',
  'Write 500 words',
];
const ONE_TIME_SEEDS = [
  'Reply to mentor email',
  'Book dentist appointment',
  'Clean desk setup',
  'Submit expense report',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Keep the ball on-screen and clear of the status bar/notch while dragging. */
function clampY(y: number): number {
  const min = 56; // below status bar / HUD
  const max = Math.max(min, Dimensions.get('window').height - BALL_SIZE - 32);
  return Math.min(Math.max(y, min), max);
}

function seedHabitInput(): HabitInput {
  const h = String(6 + Math.floor(Math.random() * 14)).padStart(2, '0');
  return {
    name: pick(HABIT_SEEDS),
    easyVersion: 'Do a tiny 10-minute version',
    description: 'Seeded by the dev ball.',
    questType: 'habit' as QuestType,
    stat: pick(STATS),
    difficulty: pick(DIFFICULTIES),
    time: `${h}:${pick(['00', '15', '30', '45'])}`,
    days: [0, 1, 2, 3, 4, 5, 6],
  };
}

function seedOneTimeInput(): HabitInput {
  return {
    ...seedHabitInput(),
    name: pick(ONE_TIME_SEEDS),
    easyVersion: null,
    questType: 'one_time' as QuestType,
    description: 'One-time todo seeded by the dev ball.',
    time: '23:50',
  };
}

/**
 * Every date key from this ISO week's Monday through today, inclusive - the
 * window a backfilled "already completed" quest should cover. Uses the same
 * UTC helpers as eiyu-logic so seeded keys line up with what the board and
 * history screens read back.
 */
function weekToDateKeys(now: Date = new Date()): string[] {
  const monday = mondayOfWeek(now);
  const today = startOfUtcDay(now);
  const keys: string[] = [];
  for (let d = monday; d <= today; d = addUtcDays(d, 1)) keys.push(toDateKey(d));
  return keys;
}

interface Tool {
  label: string;
  run: () => void | Promise<void>;
}

export function DevBall() {
  if (!__DEV__) return null;
  return <DevBallInner />;
}

function DevBallInner() {
  const { user, theme, saveHabit, toggleQuest, setDarkMode, darkMode, notificationsEnabled } = useEiyu();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const qc = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);
  const [pos, setPosState] = useState(() => ({
    x: Dimensions.get('window').width - BALL_SIZE - EDGE,
    y: Math.round(Dimensions.get('window').height * 0.35),
  }));
  // Mirror of `pos` for gesture closures: PanResponder's handlers are created
  // ONCE via useRef, so they must never read state variables directly — those
  // are frozen at mount values and every drag after the first would jump.
  const posRef = useRef(pos);
  const startRef = useRef({ ...posRef.current });

  const setPos = (
    next: { x: number; y: number } | ((p: { x: number; y: number }) => { x: number; y: number })
  ) => {
    setPosState(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      posRef.current = resolved;
      return resolved;
    });
  };

  // Web dev target: a resized browser window can leave the ball's stored X
  // outside the new viewport. Re-snap to the nearest edge + clamp Y on any
  // dimension change (no-op for phone rotation; app.json locks portrait).
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window: dim }) => {
      setPos(p => ({
        x: p.x + BALL_SIZE / 2 < dim.width / 2 ? EDGE : dim.width - BALL_SIZE - EDGE,
        y: clampY(Math.min(p.y, dim.height - BALL_SIZE - 32)),
      }));
    });
    return () => sub.remove();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Read through the ref - `pos` here is frozen at mount values.
        startRef.current = { ...posRef.current };
      },
      onPanResponderMove: (_, g) => {
        setPos({
          x: startRef.current.x + g.dx,
          y: clampY(startRef.current.y + g.dy),
        });
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
          setShowMenu(true);
          return;
        }
        const w = Dimensions.get('window').width;
        setPos(p => ({ x: p.x + BALL_SIZE / 2 < w / 2 ? EDGE : w - BALL_SIZE - EDGE, y: clampY(p.y) }));
      },
    })
  ).current;

  const tools: Tool[] = [
    { label: 'Seed habit quest', run: () => saveHabit(seedHabitInput()) },
    { label: 'Seed ONE-TIME quest', run: () => saveHabit(seedOneTimeInput()) },
    {
      label: 'Complete all today',
      run: () => user.quests.filter(q => !q.completed).forEach(q => toggleQuest(q.id)),
    },
    {
      label: 'Undo all today',
      run: () => user.quests.filter(q => q.completed).forEach(q => toggleQuest(q.id)),
    },
    {
      label: 'Seed quest completed this week',
      run: async () => {
        if (!userId) throw new Error('Not signed in.');
        const input = seedHabitInput();
        const habitId = await createHabit(userId, input);
        // Backdate through complete_habit rather than inserting rows directly:
        // the RPC awards the matching XP in the same transaction, so seeded
        // history and the stat bars agree instead of drifting apart.
        const keys = weekToDateKeys();
        let seeded = 0;
        for (const key of keys) {
          if (Math.random() < 0.25) continue; // leave some gaps to exercise streak breaks
          const kind: CompletionKind = Math.random() < 0.75 ? 'full' : 'easy';
          await completeHabit(userId, habitId, input.stat, kind, key);
          seeded += 1;
        }
        await qc.invalidateQueries();
        Alert.alert(
          'Seeded',
          `"${input.name}" with ${seeded} of ${keys.length} day(s) this week completed.`
        );
      },
    },
    {
      label: 'Wipe completion history',
      run: () => {
        if (!userId) throw new Error('Not signed in.');
        Alert.alert(
          'Wipe completion history?',
          'Deletes every habit completion on this account and reverses the XP each one awarded. Quests themselves are kept.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Wipe',
              style: 'destructive',
              onPress: async () => {
                // Runs outside the menu's try/catch (Alert callbacks are
                // detached), so it owns its own error reporting.
                try {
                  const { data, error } = await supabase
                    .from('habit_completions')
                    .select('habit_id, completed_on')
                    .eq('user_id', userId);
                  if (error) throw error;
                  // One undo RPC per row rather than a bulk delete: the RPC is
                  // what reverses xp_awarded, and a raw delete would leave the
                  // stat bars holding XP for history that no longer exists.
                  for (const row of data ?? []) {
                    const { error: rpcError } = await supabase.rpc('undo_habit_completion', {
                      p_habit_id: row.habit_id,
                      p_completed_on: row.completed_on,
                    });
                    if (rpcError) throw rpcError;
                  }
                  await qc.invalidateQueries();
                  Alert.alert('History wiped', `Removed ${(data ?? []).length} completion(s).`);
                } catch (err) {
                  Alert.alert('Wipe failed', String(err));
                }
              },
            },
          ]
        );
      },
    },
    { label: 'Refetch everything', run: () => qc.invalidateQueries() },
    {
      label: 'Clear AI suggestion cache',
      run: async () => {
        await AsyncStorage.removeItem(AI_SUGGESTIONS_STORAGE_KEY);
      },
    },
    {
      label: 'Dump store state (console)',
      run: () => {
        const summary = {
          name: user.name,
          rank: user.rank,
          stats: user.stats,
          quests: user.quests.map(q => ({
            type: q.questType,
            name: q.name,
            completed: q.completed,
            streak: q.streak,
            frozen: q.frozen,
            hasNote: !!q.description,
          })),
          longQuests: user.longQuests.length,
          notificationsEnabled,
        };
        console.log('[DevBall] store state:', JSON.stringify(summary, null, 2));
        Alert.alert('Dumped to console', `${user.quests.length} quests - see Metro logs.`);
      },
    },
    {
      label: darkMode ? 'Switch to light theme' : 'Switch to dark theme',
      run: () => setDarkMode(!darkMode),
    },
    { label: 'Open history modal', run: () => { setShowMenu(false); router.push('/history'); } },
  ];

  const ball = (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.ball,
        {
          left: pos.x,
          top: pos.y,
          backgroundColor: theme.accentGlass,
          borderColor: theme.accentBorder,
        },
      ]}>
      <Text style={[styles.ballGlyph, { color: theme.accent, fontFamily: fonts.display }]}>D</Text>
    </View>
  );

  return (
    <>
      {!showMenu && ball}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <View style={styles.scrim}>
          {/* Swallow taps on the scrim so only CLOSE/backdrop-dismiss exits. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMenu(false)} />
          <View style={[styles.card, { backgroundColor: theme.modal, borderColor: theme.glassBorder }]}
            onStartShouldSetResponder={() => true}>
            <Text style={[styles.title, { color: theme.accent, fontFamily: fonts.display }]}>DEV TOOLS</Text>
            {tools.map(tool => (
              <Pressable
                key={tool.label}
                onPress={async () => {
                  try {
                    await tool.run();
                  } catch (err) {
                    Alert.alert('Tool failed', String(err));
                  }
                }}
                style={[styles.toolRow, { borderColor: theme.glassBorder }]}
                accessibilityRole="button">
                <Text style={[styles.toolLabel, { color: theme.text, fontFamily: fonts.body }]}>{tool.label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowMenu(false)} style={[styles.closeRow, { borderColor: theme.accentBorder }]}>
              <Text style={[styles.toolLabel, { color: theme.accent, fontFamily: fonts.display }]}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  ball: {
    position: 'absolute',
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9998,
    elevation: 10,
  },
  ballGlyph: {
    fontSize: 22,
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    alignSelf: 'center',
    width: '86%',
    maxWidth: 340,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 8,
    maxHeight: '80%',
  },
  title: {
    fontSize: 16,
    letterSpacing: 2,
    marginBottom: 4,
  },
  toolRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  toolLabel: {
    fontSize: 13,
  },
  closeRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
});