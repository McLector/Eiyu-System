import { useState } from 'react';
import { LongQuest, STAT_COLORS, type Stat } from '@eiyu/shared';
import { StatIcon, PlusIcon, CheckIcon, ChevronIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';

// ── SVG assets ──────────────────────────────────────────

type DungeonProps = { color: string; isDone: boolean; isNext: boolean };

function getTheme({ color, isDone, isNext }: DungeonProps) {
  return {
    stroke: isDone ? color : isNext ? color : 'rgba(103,232,249,0.18)',
    fill: isDone ? color + '28' : isNext ? color + '12' : 'rgba(6,20,40,0.65)',
    dark: isDone ? color + '55' : '#060e1c',
    glow: isDone ? `drop-shadow(0 0 7px ${color}99)` : isNext ? `drop-shadow(0 0 5px ${color}44)` : 'none',
  };
}

/* 0 — Castle tower */
function CastleTower({ color, isDone, isNext }: DungeonProps) {
  const t = getTheme({ color, isDone, isNext });
  return (
    <svg width="38" height="46" viewBox="0 0 38 46" fill="none" style={{ filter: t.glow, transition: 'filter 0.3s' }}>
      <rect x="2"  y="10" width="8"  height="9"  rx="1.5" fill={t.fill} stroke={t.stroke} strokeWidth="1.5"/>
      <rect x="14" y="5"  width="10" height="14" rx="1.5" fill={t.fill} stroke={t.stroke} strokeWidth="1.5"/>
      <rect x="28" y="10" width="8"  height="9"  rx="1.5" fill={t.fill} stroke={t.stroke} strokeWidth="1.5"/>
      <rect x="4"  y="17" width="30" height="29" rx="1.5" fill={t.fill} stroke={t.stroke} strokeWidth="1.5"/>
      <rect x="7"  y="23" width="4"  height="8"  rx="1"   fill={t.dark} opacity="0.9"/>
      <rect x="27" y="23" width="4"  height="8"  rx="1"   fill={t.dark} opacity="0.9"/>
      <path d="M14 46 L14 32 Q19 23 24 32 L24 46Z" fill={t.dark} stroke={t.stroke} strokeWidth="1.5"/>
      {isDone && <path d="M14 46 L14 32 Q19 23 24 32 L24 46Z" fill={color} opacity="0.3"/>}
    </svg>
  );
}

/* 1 — Mountain cave */
function MountainCave({ color, isDone, isNext }: DungeonProps) {
  const t = getTheme({ color, isDone, isNext });
  return (
    <svg width="38" height="46" viewBox="0 0 38 46" fill="none" style={{ filter: t.glow, transition: 'filter 0.3s' }}>
      {/* Main mountain */}
      <path d="M19 3 L37 42 L1 42 Z" fill={t.fill} stroke={t.stroke} strokeWidth="1.5" strokeLinejoin="round"/>
      {/* Snow cap */}
      <path d="M19 3 L27 19 L11 19 Z" fill={isDone ? color + '40' : 'rgba(255,255,255,0.07)'} stroke={t.stroke} strokeWidth="1"/>
      {/* Left rock shoulder */}
      <path d="M1 42 L9 28 L16 38 Z" fill={t.fill} stroke={t.stroke} strokeWidth="1"/>
      {/* Cave arch */}
      <path d="M13 42 L13 32 Q19 23 25 32 L25 42Z" fill={t.dark} stroke={t.stroke} strokeWidth="1.5"/>
      {isDone && <path d="M13 42 L13 32 Q19 23 25 32 L25 42Z" fill={color} opacity="0.25"/>}
      {/* Cave glow inside */}
      {(isDone || isNext) && <ellipse cx="19" cy="36" rx="4" ry="3" fill={color} opacity={isDone ? 0.3 : 0.15}/>}
      {/* Rock cracks */}
      <line x1="10" y1="30" x2="14" y2="42" stroke={t.stroke} strokeWidth="1" opacity="0.5"/>
      <line x1="26" y1="26" x2="30" y2="38" stroke={t.stroke} strokeWidth="1" opacity="0.5"/>
      {/* Ground line */}
      <line x1="1" y1="42" x2="37" y2="42" stroke={t.stroke} strokeWidth="1.5"/>
    </svg>
  );
}

/* 2 — Mine shaft */
function MineShaft({ color, isDone, isNext }: DungeonProps) {
  const t = getTheme({ color, isDone, isNext });
  const wood = isDone ? color : isNext ? color + 'bb' : 'rgba(120,80,40,0.6)';
  return (
    <svg width="38" height="46" viewBox="0 0 38 46" fill="none" style={{ filter: t.glow, transition: 'filter 0.3s' }}>
      {/* Ground */}
      <rect x="0" y="38" width="38" height="3" rx="1" fill={t.fill} stroke={t.stroke} strokeWidth="1"/>
      {/* Shaft darkness */}
      <rect x="10" y="10" width="18" height="29" fill={t.dark}/>
      {/* Left post */}
      <rect x="7"  y="8" width="5" height="31" rx="1.5" fill={wood} stroke={t.stroke} strokeWidth="1.5"/>
      {/* Right post */}
      <rect x="26" y="8" width="5" height="31" rx="1.5" fill={wood} stroke={t.stroke} strokeWidth="1.5"/>
      {/* Top beam */}
      <rect x="5" y="5" width="28" height="5" rx="1.5" fill={wood} stroke={t.stroke} strokeWidth="1.5"/>
      {/* Mid brace */}
      <rect x="7" y="21" width="24" height="3" rx="1" fill={wood} stroke={t.stroke} strokeWidth="1"/>
      {/* Cross supports */}
      <line x1="7"  y1="8"  x2="28" y2="21" stroke={t.stroke} strokeWidth="1.2" opacity="0.6"/>
      <line x1="31" y1="8"  x2="10" y2="21" stroke={t.stroke} strokeWidth="1.2" opacity="0.6"/>
      <line x1="7"  y1="24" x2="28" y2="38" stroke={t.stroke} strokeWidth="1.2" opacity="0.6"/>
      <line x1="31" y1="24" x2="10" y2="38" stroke={t.stroke} strokeWidth="1.2" opacity="0.6"/>
      {/* Rail tracks */}
      <rect x="13" y="34" width="3" height="7" rx="0.5" fill={t.stroke} opacity="0.7"/>
      <rect x="22" y="34" width="3" height="7" rx="0.5" fill={t.stroke} opacity="0.7"/>
      <rect x="12" y="35" width="14" height="2" rx="0.5" fill={t.stroke} opacity="0.5"/>
      <rect x="12" y="38" width="14" height="2" rx="0.5" fill={t.stroke} opacity="0.5"/>
      {/* Glow inside */}
      {(isDone || isNext) && <rect x="10" y="10" width="18" height="29" fill={color} opacity={isDone ? 0.18 : 0.08}/>}
      {isDone && <ellipse cx="19" cy="24" rx="5" ry="6" fill={color} opacity="0.2"/>}
    </svg>
  );
}

/* 3 — Ancient ruins */
function AncientRuins({ color, isDone, isNext }: DungeonProps) {
  const t = getTheme({ color, isDone, isNext });
  return (
    <svg width="38" height="46" viewBox="0 0 38 46" fill="none" style={{ filter: t.glow, transition: 'filter 0.3s' }}>
      {/* Ground rubble line */}
      <line x1="1" y1="43" x2="37" y2="43" stroke={t.stroke} strokeWidth="1.5"/>
      {/* Left pillar — full */}
      <rect x="3" y="13" width="9" height="30" rx="1" fill={t.fill} stroke={t.stroke} strokeWidth="1.5"/>
      {/* Left capital */}
      <rect x="1" y="10" width="13" height="5"  rx="1" fill={t.fill} stroke={t.stroke} strokeWidth="1.5"/>
      {/* Left pillar flutes */}
      <line x1="6"  y1="15" x2="6"  y2="42" stroke={t.stroke} strokeWidth="0.8" opacity="0.4"/>
      <line x1="9"  y1="15" x2="9"  y2="42" stroke={t.stroke} strokeWidth="0.8" opacity="0.4"/>
      {/* Right pillar — broken top */}
      <rect x="26" y="18" width="9" height="25" rx="1" fill={t.fill} stroke={t.stroke} strokeWidth="1.5"/>
      {/* Right broken edge (jagged) */}
      <path d="M26 18 L28 12 L30 17 L32 10 L35 18Z" fill={t.fill} stroke={t.stroke} strokeWidth="1.5" strokeLinejoin="round"/>
      {/* Right pillar flutes */}
      <line x1="29" y1="20" x2="29" y2="42" stroke={t.stroke} strokeWidth="0.8" opacity="0.4"/>
      <line x1="32" y1="20" x2="32" y2="42" stroke={t.stroke} strokeWidth="0.8" opacity="0.4"/>
      {/* Partial lintel (broken) */}
      <rect x="12" y="18" width="15" height="4" rx="1" fill={t.fill} stroke={t.stroke} strokeWidth="1.5"/>
      {/* Gap in lintel */}
      <rect x="21" y="17" width="4" height="6" rx="0.5" fill="transparent" stroke="none"/>
      {/* Rubble chunks */}
      <rect x="14" y="39" width="5"  height="4" rx="1" fill={t.fill} stroke={t.stroke} strokeWidth="1"/>
      <rect x="21" y="41" width="4"  height="3" rx="1" fill={t.fill} stroke={t.stroke} strokeWidth="1"/>
      {/* Portal glow between pillars */}
      {(isDone || isNext) && (
        <rect x="12" y="22" width="14" height="21" fill={color} opacity={isDone ? 0.15 : 0.07}/>
      )}
      {isDone && <ellipse cx="19" cy="32" rx="5" ry="7" fill={color} opacity="0.2"/>}
    </svg>
  );
}

/* 4 — Vault / iron hatch */
function VaultDoor({ color, isDone, isNext }: DungeonProps) {
  const t = getTheme({ color, isDone, isNext });
  const metal = isDone ? color + '55' : 'rgba(50,65,85,0.8)';
  return (
    <svg width="38" height="46" viewBox="0 0 38 46" fill="none" style={{ filter: t.glow, transition: 'filter 0.3s' }}>
      {/* Stone wall background */}
      <rect x="1" y="4" width="36" height="42" rx="2" fill={t.fill} stroke={t.stroke} strokeWidth="1.5"/>
      {/* Stone block grid */}
      <line x1="1"  y1="18" x2="37" y2="18" stroke={t.stroke} strokeWidth="0.8" opacity="0.4"/>
      <line x1="1"  y1="31" x2="37" y2="31" stroke={t.stroke} strokeWidth="0.8" opacity="0.4"/>
      <line x1="13" y1="4"  x2="13" y2="18" stroke={t.stroke} strokeWidth="0.8" opacity="0.4"/>
      <line x1="25" y1="18" x2="25" y2="31" stroke={t.stroke} strokeWidth="0.8" opacity="0.4"/>
      <line x1="10" y1="31" x2="10" y2="46" stroke={t.stroke} strokeWidth="0.8" opacity="0.4"/>
      <line x1="27" y1="31" x2="27" y2="46" stroke={t.stroke} strokeWidth="0.8" opacity="0.4"/>
      {/* Circular vault door */}
      <circle cx="19" cy="25" r="13" fill={metal} stroke={t.stroke} strokeWidth="2"/>
      {/* Door ring detail */}
      <circle cx="19" cy="25" r="10" fill="none" stroke={t.stroke} strokeWidth="1" opacity="0.6"/>
      {/* Locking bolts (4 corners) */}
      <circle cx="10" cy="16" r="2" fill={isDone ? color : '#1e293b'} stroke={t.stroke} strokeWidth="1.2"/>
      <circle cx="28" cy="16" r="2" fill={isDone ? color : '#1e293b'} stroke={t.stroke} strokeWidth="1.2"/>
      <circle cx="10" cy="34" r="2" fill={isDone ? color : '#1e293b'} stroke={t.stroke} strokeWidth="1.2"/>
      <circle cx="28" cy="34" r="2" fill={isDone ? color : '#1e293b'} stroke={t.stroke} strokeWidth="1.2"/>
      {/* Wheel spokes */}
      <line x1="19" y1="13" x2="19" y2="37" stroke={t.stroke} strokeWidth="1.5" opacity="0.7"/>
      <line x1="7"  y1="25" x2="31" y2="25" stroke={t.stroke} strokeWidth="1.5" opacity="0.7"/>
      <line x1="10" y1="16" x2="28" y2="34" stroke={t.stroke} strokeWidth="1.2" opacity="0.5"/>
      <line x1="28" y1="16" x2="10" y2="34" stroke={t.stroke} strokeWidth="1.2" opacity="0.5"/>
      {/* Center hub */}
      <circle cx="19" cy="25" r="3.5" fill={isDone ? color : '#0f172a'} stroke={t.stroke} strokeWidth="1.5"/>
      {/* Glow when done */}
      {isDone && <circle cx="19" cy="25" r="13" fill={color} opacity="0.1"/>}
      {isDone && <circle cx="19" cy="25" r="3.5" fill={color} opacity="0.6"/>}
    </svg>
  );
}

function stableRandom(seed: string): number {
  const s = seed ?? '0';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return Math.abs(h) % 5;
}

function DungeonIcon({ color, isDone, isNext, seed }: DungeonProps & { seed: string }) {
  const type = stableRandom(seed);
  if (type === 1) return <MountainCave color={color} isDone={isDone} isNext={isNext} />;
  if (type === 2) return <MineShaft    color={color} isDone={isDone} isNext={isNext} />;
  if (type === 3) return <AncientRuins color={color} isDone={isDone} isNext={isNext} />;
  if (type === 4) return <VaultDoor    color={color} isDone={isDone} isNext={isNext} />;
  return <CastleTower color={color} isDone={isDone} isNext={isNext} />;
}

function WarriorIcon({ color }: { color: string }) {
  return (
    <svg width="30" height="44" viewBox="0 0 30 44" fill="none">
      {/* Ground shadow */}
      <ellipse cx="15" cy="43" rx="9" ry="2" fill={color} opacity="0.25"/>
      {/* Left leg */}
      <rect x="8" y="30" width="5" height="12" rx="2" fill="#475569"/>
      {/* Right leg */}
      <rect x="17" y="30" width="5" height="12" rx="2" fill="#475569"/>
      {/* Armor skirt */}
      <path d="M7 29 Q15 33 23 29 L21 38 H9 Z" fill="#334155"/>
      {/* Body/chest */}
      <rect x="6" y="16" width="18" height="15" rx="3" fill="#475569"/>
      {/* Chest plate */}
      <rect x="8" y="18" width="14" height="11" rx="2" fill="#64748b"/>
      {/* Chest line detail */}
      <line x1="15" y1="18" x2="15" y2="29" stroke="#334155" strokeWidth="1.5"/>
      {/* Left pauldron */}
      <ellipse cx="5" cy="19" rx="5" ry="4" fill="#374151"/>
      {/* Right pauldron */}
      <ellipse cx="25" cy="19" rx="5" ry="4" fill="#374151"/>
      {/* Neck */}
      <rect x="12" y="13" width="6" height="5" rx="1" fill="#475569"/>
      {/* Helmet */}
      <rect x="8" y="4" width="14" height="12" rx="5" fill="#374151"/>
      {/* Helmet ridge */}
      <rect x="13" y="2" width="4" height="6" rx="1" fill="#475569"/>
      {/* Visor slot */}
      <rect x="9" y="11" width="12" height="4" rx="1" fill="#0f172a"/>
      {/* Visor glow */}
      <rect x="10" y="12" width="10" height="2" rx="1" fill={color} opacity="0.9"/>
      <rect x="10" y="12" width="10" height="2" rx="1" fill={color} opacity="0.4" style={{ filter: `blur(2px)` }}/>
      {/* Sword blade */}
      <rect x="27" y="2" width="2.5" height="20" rx="1" fill="#94a3b8"/>
      {/* Crossguard */}
      <rect x="23" y="13" width="10" height="2.5" rx="1" fill="#64748b"/>
      {/* Sword hilt */}
      <rect x="27.5" y="22" width="1.5" height="5" rx="0.5" fill="#92400e"/>
      {/* Shield */}
      <path d="M1 17 L6 17 L6 27 L3.5 30 L1 27 Z" fill="#334155" stroke="#475569" strokeWidth="1"/>
      {/* Shield emblem */}
      <path d="M2.5 19 L5 19 L5 26 L3.5 28 L2.5 26 Z" fill={color} opacity="0.35"/>
    </svg>
  );
}

// ── Milestone track ──────────────────────────────────────

const ROAD_Y = 100;
const DUNGEON_H = 46;
const WARRIOR_H = 44;
const TRACK_L = 5;   // % from left edge to first node
const TRACK_R = 5;   // % from right edge to last node

function nodeXPct(i: number, total: number): number {
  if (total === 1) return 50;
  return TRACK_L + (i / (total - 1)) * (100 - TRACK_L - TRACK_R);
}

function warriorXPct(done: number, total: number): number {
  if (total <= 1) return 50;
  const span = 100 - TRACK_L - TRACK_R;
  if (done === 0) return TRACK_L;
  if (done >= total) return TRACK_L + span;
  const frac = (done - 0.5) / (total - 1);
  return TRACK_L + frac * span;
}

function MilestoneTrack({ lq }: { lq: LongQuest }) {
  const color = STAT_COLORS[lq.stat];
  const total = lq.stages.length;
  const done = lq.stages.filter(s => s.done).length;

  const warriorX = warriorXPct(done, total);
  const fillW = total <= 1 ? 0 : done === 0 ? 0 : done >= total
    ? 100
    : ((done - 0.5) / (total - 1)) * 100;

  // How far into the track span the fill goes (as % of the track span)
  const fillPct = fillW;

  return (
    <div style={{ padding: '20px 36px 0', position: 'relative' }}>
      <div style={{ position: 'relative', height: ROAD_Y + DUNGEON_H / 2 + 36, overflow: 'visible' }}>

        {/* Road base line */}
        <div style={{
          position: 'absolute',
          top: ROAD_Y - 1,
          left: `${TRACK_L}%`,
          right: `${TRACK_R}%`,
          height: 3,
          borderRadius: 2,
          background: 'var(--c-glass-border)',
        }}>
          {/* Progress fill */}
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: `${fillPct}%`,
            background: color,
            borderRadius: 2,
            boxShadow: `0 0 8px ${color}66`,
            transition: 'width 0.5s ease',
          }} />
        </div>

        {/* Road texture dots */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: ROAD_Y - 1,
            left: `${TRACK_L + (i + 0.5) * (100 - TRACK_L - TRACK_R) / 12}%`,
            width: 3, height: 3,
            borderRadius: '50%',
            background: 'var(--c-glass-border)',
            opacity: 0.4,
            transform: 'translateY(-0.5px)',
          }} />
        ))}

        {/* Warrior — above the road */}
        <div style={{
          position: 'absolute',
          top: ROAD_Y - WARRIOR_H - DUNGEON_H / 2 - 4,
          left: `${warriorX}%`,
          transform: 'translateX(-50%)',
          transition: 'left 0.6s cubic-bezier(0.34,1.56,0.64,1)',
          zIndex: 10,
          filter: `drop-shadow(0 0 10px ${color}66)`,
        }}>
          <WarriorIcon color={color} />
        </div>

        {/* Dungeon nodes + labels */}
        {lq.stages.map((stage, i) => {
          const isDone = stage.done;
          const isNext = !isDone && (i === 0 || lq.stages[i - 1].done);
          const xPct = nodeXPct(i, total);
          const labelAlign = i === 0 ? 'left' : i === total - 1 ? 'right' : 'center';
          const labelLeft = i === 0 ? 0 : i === total - 1 ? 'auto' : '50%';
          const labelRight = i === total - 1 ? 0 : 'auto';
          const labelTransform = i === 0 || i === total - 1 ? 'none' : 'translateX(-50%)';

          return (
            <div key={i} style={{
              position: 'absolute',
              top: ROAD_Y - DUNGEON_H / 2,
              left: `${xPct}%`,
              transform: 'translateX(-50%)',
              zIndex: 5,
            }}>
              <DungeonIcon color={color} isDone={isDone} isNext={isNext} seed={String(lq.id ?? '') + i} />
              {/* Stage label */}
              <div style={{
                position: 'absolute',
                top: DUNGEON_H + 6,
                left: labelLeft,
                right: labelRight,
                transform: labelTransform,
                whiteSpace: 'nowrap',
                maxWidth: 100,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontFamily: 'Inter',
                fontSize: 10.5,
                fontWeight: isNext ? 600 : 400,
                color: isDone ? 'var(--c-dim)' : isNext ? 'var(--c-text)' : 'var(--c-dim)',
                textDecoration: isDone ? 'line-through' : 'none',
                textAlign: labelAlign,
                transition: 'color 0.3s',
                letterSpacing: isNext ? '0.01em' : 0,
              }}>
                {stage.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0 20px' }}>
        <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim)' }}>
          {done === 0 ? 'Not started' : done === total ? '✦ Complete' : `${done} of ${total} stages cleared`}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color, fontWeight: 600 }}>
          {Math.round((done / total) * 100)}%
        </span>
      </div>
    </div>
  );
}

// ── Quest card ───────────────────────────────────────────

function LongQuestCard({ lq, expanded, onToggleExpand }: {
  lq: LongQuest; expanded: boolean; onToggleExpand: () => void;
}) {
  const { toggleStage: toggleStageAction, removeLongQuest, saveLongQuest } = useEiyu();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(lq.name);
  const [editStat, setEditStat] = useState<Stat>(lq.stat);
  const [editDescription, setEditDescription] = useState(lq.description ?? '');
  const [editStages, setEditStages] = useState<{ id: string | null; name: string; description: string | null }[]>(
    lq.stages.map(s => ({ id: s.id, name: s.name, description: s.description }))
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const color = STAT_COLORS[lq.stat];

  const toggleStage = (stageId: string) => {
    toggleStageAction(lq.id, stageId);
  };

  const startEditing = () => {
    setEditName(lq.name);
    setEditStat(lq.stat);
    setEditDescription(lq.description ?? '');
    setEditStages(lq.stages.map(s => ({ id: s.id, name: s.name, description: s.description })));
    setSaveError(null);
    setEditing(true);
  };

  const MIN_STAGES = 2;

  const setEditStageNameAt = (i: number, value: string) => {
    setEditStages(prev => prev.map((s, idx) => (idx === i ? { ...s, name: value } : s)));
  };

  const removeEditStage = (i: number) => {
    if (editStages.length <= MIN_STAGES) return;
    setEditStages(prev => prev.filter((_, idx) => idx !== i));
  };

  const filledEditStages = editStages
    .map(s => ({ ...s, name: s.name.trim() }))
    .filter(s => s.name.length > 0);
  const editValid = editName.trim().length > 0 && filledEditStages.length >= MIN_STAGES;

  const saveEdit = async () => {
    if (!editValid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveLongQuest(
        {
          name: editName.trim(),
          stat: editStat,
          description: editDescription.trim() || undefined,
          stages: filledEditStages.map(s => ({ id: s.id, name: s.name, description: s.description })),
        },
        lq.id
      );
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <button onClick={onToggleExpand} style={{
        width: '100%', padding: '22px 36px 16px', display: 'flex', alignItems: 'center', gap: 16,
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11, flexShrink: 0,
          background: color + '18', border: `1.5px solid ${color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <StatIcon stat={lq.stat} size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em' }}>
            {lq.name}
          </div>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, color, letterSpacing: '0.1em', marginTop: 2 }}>
            {lq.stat}
          </div>
          {lq.description && (
            <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>
              📝 {lq.description}
            </div>
          )}
        </div>
        <div style={{ transform: `rotate(${expanded ? 180 : 0}deg)`, transition: 'transform 0.2s', color: 'var(--c-dim)', flexShrink: 0 }}>
          <ChevronIcon />
        </div>
      </button>

      {/* Milestone track — always visible */}
      <div style={{ borderTop: '1px solid var(--c-glass-border)' }}>
        <MilestoneTrack lq={lq} />
      </div>

      {/* Stage checklist — expanded, hidden while editing */}
      {expanded && !editing && (
        <div style={{ borderTop: '1px solid var(--c-glass-border)', padding: '16px 36px 24px' }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-dim)', marginBottom: 12 }}>
            STAGES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lq.stages.map(stage => (
              <button key={stage.id} onClick={() => toggleStage(stage.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
                background: stage.done ? 'rgba(74,222,128,0.05)' : 'var(--c-accent-glass)',
                border: `1px solid ${stage.done ? 'rgba(74,222,128,0.15)' : 'var(--c-glass-border)'}`,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  background: stage.done ? 'rgba(74,222,128,0.18)' : 'transparent',
                  border: `1.5px solid ${stage.done ? 'rgba(74,222,128,0.5)' : color + '55'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {stage.done && <CheckIcon />}
                </div>
                <span style={{
                  fontFamily: 'Inter', fontSize: 13,
                  color: stage.done ? 'var(--c-muted)' : 'var(--c-text)',
                  textDecoration: stage.done ? 'line-through' : 'none',
                }}>
                  {stage.name}
                </span>
                {stage.description && (
                  <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-dim)', marginLeft: 8 }}>
                    {stage.description}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={startEditing}
              className="btn-ghost"
              style={{
                flex: 1, padding: '10px', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700,
                color: 'var(--c-accent)', letterSpacing: '0.08em',
              }}
            >
              EDIT
            </button>
            <button
              onClick={() => {
                if (!confirmDelete) { setConfirmDelete(true); return; }
                removeLongQuest(lq.id);
              }}
              onMouseLeave={() => setConfirmDelete(false)}
              style={{
                flex: 1, padding: '10px', borderRadius: 10,
                cursor: 'pointer', transition: 'all 0.15s',
                background: confirmDelete ? 'rgba(248,113,113,0.12)' : 'transparent',
                border: `1px solid ${confirmDelete ? 'rgba(248,113,113,0.45)' : 'rgba(248,113,113,0.2)'}`,
                fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700,
                color: '#f87171', letterSpacing: '0.08em',
              }}
            >
              {confirmDelete ? 'CONFIRM DELETE' : 'DELETE LONG QUEST'}
            </button>
          </div>
        </div>
      )}

      {/* Edit form — replaces the stage checklist while editing */}
      {expanded && editing && (
        <div style={{ borderTop: '1px solid var(--c-glass-border)', padding: '16px 36px 24px' }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.1em', marginBottom: 14 }}>EDIT LONG QUEST</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input className="field" placeholder="Quest name..." value={editName} onChange={e => setEditName(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['STR','INT','DEX','WIS','CHA'] as const).map(s => (
                <button key={s} onClick={() => setEditStat(s)} className="btn-ghost" style={{ padding: '5px 12px', fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: editStat === s ? STAT_COLORS[s] : 'var(--c-muted)', borderColor: editStat === s ? STAT_COLORS[s] + '55' : 'var(--c-accent-border)' }}>
                  {s}
                </button>
              ))}
            </div>
            <textarea
              className="field"
              placeholder="Note (optional) — context, why it matters..."
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
              rows={2}
            />
            <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim)' }}>STAGES</div>
            {editStages.map((st, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="field"
                  style={{ flex: 1 }}
                  placeholder={`Stage ${i + 1}...`}
                  value={st.name}
                  onChange={e => setEditStageNameAt(i, e.target.value)}
                />
                {editStages.length > MIN_STAGES && (
                  <button
                    onClick={() => removeEditStage(i)}
                    style={{ background: 'none', border: 'none', color: 'var(--c-dim)', fontSize: 18, cursor: 'pointer', padding: '0 6px' }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setEditStages([...editStages, { id: null, name: '', description: null }])} style={{ background: 'none', border: '1px dashed var(--c-glass-border)', borderRadius: 8, padding: '8px', fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim)', cursor: 'pointer' }}>
              + Add stage
            </button>
            {saveError && <p style={{ color: '#f87171', fontSize: 12 }}>{saveError}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => void saveEdit()}
                disabled={!editValid || saving}
                className="btn-ghost"
                style={{ flex: 1, padding: '10px', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em', opacity: !editValid || saving ? 0.5 : 1 }}
              >
                {saving ? 'SAVING…' : 'SAVE CHANGES'}
              </button>
              <button onClick={() => setEditing(false)} style={{ padding: '10px 18px', background: 'none', border: '1px solid var(--c-glass-border)', borderRadius: 50, fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted)', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────

export default function WebLongQuests() {
  const { user, longQuestsLoading, longQuestsError, retryLongQuests, saveLongQuest } = useEiyu();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStat, setNewStat] = useState<Stat>('INT');
  const [newStages, setNewStages] = useState(['', '']);
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const addLongQuest = async () => {
    if (!newName.trim() || creating) return;
    const stages = newStages.map(s => s.trim()).filter(Boolean).map(name => ({ name }));
    if (stages.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      await saveLongQuest({
        name: newName.trim(),
        stat: newStat,
        description: newDescription.trim() || undefined,
        stages,
      });
      setShowNew(false);
      setNewName('');
      setNewDescription('');
      setNewStages(['', '']);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: 'Rajdhani', fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.06em', margin: 0 }}>LONG QUESTS</h2>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>Multi-stage journeys tracked over time</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em' }}>
          <PlusIcon />
          NEW QUEST
        </button>
      </div>

      {showNew && (
        <div className="glass" style={{ padding: '20px', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.1em', marginBottom: 14 }}>NEW LONG QUEST</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input className="field" placeholder="Quest name..." value={newName} onChange={e => setNewName(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['STR','INT','DEX','WIS','CHA'] as const).map(s => (
                <button key={s} onClick={() => setNewStat(s)} className="btn-ghost" style={{ padding: '5px 12px', fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: newStat === s ? STAT_COLORS[s] : 'var(--c-muted)', borderColor: newStat === s ? STAT_COLORS[s] + '55' : 'var(--c-accent-border)' }}>
                  {s}
                </button>
              ))}
            </div>
            <textarea
              className="field"
              placeholder="Note (optional) — context, why it matters..."
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              rows={2}
            />
            <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim)' }}>STAGES</div>
            {newStages.map((st, i) => (
              <input key={i} className="field" placeholder={`Stage ${i + 1}...`} value={st} onChange={e => setNewStages(newStages.map((s, j) => j === i ? e.target.value : s))} />
            ))}
            <button onClick={() => setNewStages([...newStages, ''])} style={{ background: 'none', border: '1px dashed var(--c-glass-border)', borderRadius: 8, padding: '8px', fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim)', cursor: 'pointer' }}>
              + Add stage
            </button>
            {createError && <p style={{ color: '#f87171', fontSize: 12 }}>{createError}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => void addLongQuest()} className="btn-ghost" style={{ flex: 1, padding: '10px', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em' }}>CREATE</button>
              <button onClick={() => setShowNew(false)} style={{ padding: '10px 18px', background: 'none', border: '1px solid var(--c-glass-border)', borderRadius: 50, fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted)', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {longQuestsLoading ? (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Inter', fontSize: 13, color: 'var(--c-dim)' }}>Loading…</div>
      ) : longQuestsError ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: '#f87171', marginBottom: 12 }}>{longQuestsError}</p>
          <button onClick={() => void retryLongQuests()} className="btn-ghost" style={{ padding: '8px 16px', fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700 }}>RETRY</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {user.longQuests.length === 0 ? (
            <div className="glass" style={{ padding: '48px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 700, color: 'var(--c-dim)', letterSpacing: '0.06em', marginBottom: 6 }}>NO LONG QUESTS</div>
              <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-dim)' }}>Create a multi-stage quest to track your big goals</div>
            </div>
          ) : (
            user.longQuests.map(lq => (
              <LongQuestCard
                key={lq.id} lq={lq}
                expanded={expanded === lq.id}
                onToggleExpand={() => setExpanded(expanded === lq.id ? null : lq.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
