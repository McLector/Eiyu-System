import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { dropIndex, moveId, moveToIndex, REORDER_COPY } from '@eiyu/shared';

import { GripIcon } from '@/components/eiyu/icons';
import { useTokens } from '@/contexts/theme-store';

export interface ReorderItem {
  id: string;
  name: string;
}

interface Props {
  /** The rows that can be moved, in order. Rows that cannot move (finished ones) are rendered by the caller. */
  items: ReorderItem[];
  /** The ids in their new order, after a drag or an accessibility move. */
  onReorder: (ids: string[]) => void;
  /** True while a grip is held, so the screen can stop its scrolling and paging from taking the touch. */
  onDragChange?: (active: boolean) => void;
  renderRow: (id: string, grip: ReactNode) => ReactNode;
}

interface Controller {
  start: (id: string) => void;
  move: (dy: number) => void;
  end: (id: string, dy: number) => void;
  moveBy: (id: string, direction: 'up' | 'down') => void;
}

const ACTIONS = [
  { name: 'moveUp', label: REORDER_COPY.moveUp },
  { name: 'moveDown', label: REORDER_COPY.moveDown },
];

/**
 * Rows the user can reorder. Each row gets a grip: dragging it moves the row with the finger and, on release, drops
 * it where its middle ended up. The grip also carries "Move up" and "Move down" accessibility actions, and the row's
 * own action sheet offers the same moves, so dragging is never the only way. A lone row has nothing to move, so it
 * gets no grip. The touch is held by the grip while it is dragged (`onDragChange` lets the screen stop its scrollers).
 */
export function ReorderableList({ items, onReorder, onDragChange, renderRow }: Props) {
  const heights = useRef(new Map<string, number>());
  const [shift] = useState(() => new Animated.Value(0));
  const [dragId, setDragId] = useState<string | null>(null);
  const latest = useRef({ items, onReorder, onDragChange });
  useEffect(() => { latest.current = { items, onReorder, onDragChange }; });

  const controller = useMemo<Controller>(() => ({
    start: id => { shift.setValue(0); setDragId(id); latest.current.onDragChange?.(true); },
    move: dy => shift.setValue(dy),
    end: (id, dy) => {
      const { items: rows, onReorder: save, onDragChange: change } = latest.current;
      const from = rows.findIndex(row => row.id === id);
      const to = dropIndex(rows.map(row => heights.current.get(row.id) ?? 0), from, dy);
      setDragId(null);
      shift.setValue(0);
      change?.(false);
      if (from >= 0 && to !== from) save(moveToIndex(rows.map(row => row.id), id, to));
    },
    moveBy: (id, direction) => {
      const { items: rows, onReorder: save } = latest.current;
      const ids = rows.map(row => row.id);
      const next = moveId(ids, id, direction);
      if (next.some((value, index) => value !== ids[index])) save(next);
    },
  }), [shift]);

  const measure = useCallback((id: string) => (event: LayoutChangeEvent) => {
    heights.current.set(id, event.nativeEvent.layout.height);
  }, []);

  const movable = items.length > 1;
  return (
    <>
      {items.map(item => (
        <Animated.View
          key={item.id}
          testID={`reorder-row-${item.id}`}
          onLayout={measure(item.id)}
          style={dragId === item.id ? [styles.lifted, { transform: [{ translateY: shift }] }] : undefined}>
          {renderRow(item.id, movable ? <Grip id={item.id} name={item.name} controller={controller} /> : null)}
        </Animated.View>
      ))}
    </>
  );
}

function Grip({ id, name, controller }: { id: string; name: string; controller: Controller }) {
  const t = useTokens();
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // A scroller or the pager must never take the row away mid-drag.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => controller.start(id),
    onPanResponderMove: (_, gesture) => controller.move(gesture.dy),
    onPanResponderRelease: (_, gesture) => controller.end(id, gesture.dy),
    onPanResponderTerminate: () => controller.end(id, 0),
  }), [controller, id]);

  return (
    <View
      testID={`reorder-grip-${id}`}
      accessible
      accessibilityRole="button"
      accessibilityLabel={REORDER_COPY.grip(name)}
      accessibilityActions={ACTIONS}
      onAccessibilityAction={event => {
        const action = event.nativeEvent.actionName;
        if (action === 'moveUp') controller.moveBy(id, 'up');
        else if (action === 'moveDown') controller.moveBy(id, 'down');
      }}
      style={styles.grip}
      {...responder.panHandlers}>
      <GripIcon size={20} color={t['dim-flat']} />
    </View>
  );
}

const styles = StyleSheet.create({
  grip: { width: 36, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  lifted: { zIndex: 10, elevation: 6, opacity: 0.95 },
});
