import { useEffect, useState } from 'react';
import { levelProgress, STAT_COLORS, type RewardReceipt } from '@eiyu/shared';

function StatGain({ total }: { total: RewardReceipt['totals'][number] }) {
  const [xp, setXp] = useState(total.before);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setXp(total.after); return; }
    let frame = 0;
    const start = performance.now();
    const step = (time: number) => { const progress = Math.min(1, (time - start) / 600); setXp(Math.round(total.before + (total.after - total.before) * (1 - (1 - progress) ** 3))); if (progress < 1) frame = requestAnimationFrame(step); };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [total]);
  const progress = levelProgress(xp);
  return <div className="reward-stat" style={{ color: STAT_COLORS[total.stat] }}><strong>{total.stat} {total.delta > 0 ? '+' : ''}{total.delta} XP</strong><span>Level {progress.level} · {progress.xpIntoLevel} / {progress.xpForNextLevel} XP</span><progress aria-label={`${total.stat} level progress`} value={progress.xpIntoLevel} max={progress.xpForNextLevel} /></div>;
}
export default function RewardFeedback({ receipt }: { receipt?: RewardReceipt | null }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => { setVisible(true); const timer = setTimeout(() => setVisible(false), 4600); return () => clearTimeout(timer); }, [receipt?.id]);
  if (!visible || !receipt || receipt.replayed || !receipt.totals.length) return null;
  return <aside className="reward-feedback" role="status" aria-label="Confirmed XP reward">
    {receipt.totals.map(total => <StatGain key={receipt.id + total.stat} total={total} />)}
    {receipt.components.filter(c => c.kind === 'bonus').map(c => <small key={c.stat}>Completion bonus: {c.stat} {c.delta > 0 ? '+' : ''}{c.delta} XP</small>)}
  </aside>;
}
