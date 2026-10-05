import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GymRoutine } from '@eiyu/shared';

import { PlusIcon } from '@/components/eiyu/icons';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Sheet } from '@/components/ui/sheet';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  visible: boolean;
  routines: GymRoutine[];
  selectedId: string | undefined;
  showArchived: boolean;
  onToggleArchived: (value: boolean) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}

/** The routine chip's sheet: one radio per routine, "Include archived" and a way to make a new one. */
export function RoutinePickerSheet({ visible, routines, selectedId, showArchived, onToggleArchived, onSelect, onNew, onClose }: Props) {
  const t = useTokens();
  return (
    <Sheet
      visible={visible}
      title="Routines"
      onClose={onClose}
      testID="gym-routine-picker"
      footer={<Button variant="secondary" label="NEW ROUTINE" icon={<PlusIcon size={18} color={t['accent-text']} />} onPress={() => { onClose(); onNew(); }} />}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Routine">
        {routines.map(routine => {
          const selected = routine.id === selectedId;
          const label = routine.archived ? `${routine.name} (archived)` : routine.name;
          return (
            <Pressable
              key={routine.id}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: selected, selected }}
              onPress={() => { onSelect(routine.id); onClose(); }}
              style={[styles.row, { borderBottomColor: t['divider-flat'] }]}>
              <View style={[styles.dot, { borderColor: selected ? t.accent : t['glass-border'], backgroundColor: selected ? t.accent : 'transparent' }]} />
              <Text numberOfLines={2} style={[styles.name, { color: selected ? t['accent-text'] : t.text, fontFamily: fonts.display }]}>{label}</Text>
              <Text style={[styles.unit, { color: t['muted-flat'], fontFamily: fonts.mono }]}>{routine.unit}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.archived}>
        <Chip kind="checkbox" label="Include archived" selected={showArchived} onPress={() => onToggleArchived(!showArchived)} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  name: { flex: 1, fontSize: 16, letterSpacing: 0.5 },
  unit: { fontSize: 12 },
  archived: { flexDirection: 'row', paddingTop: 14 },
});
