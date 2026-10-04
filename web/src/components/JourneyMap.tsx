import { useEffect, useRef, useState } from 'react';
import { STAT_COLORS, stageSequenceState, type LongQuest } from '@eiyu/shared';
import { CheckIcon } from '../Icons';

const ROUTE = 'M10 46 Q20 65 31 35 Q42 15 53 49 Q64 70 75 37 Q84 25 91 48';
const POINTS =[{ x: 10, y: 46 }, { x: 31, y: 35 }, { x: 53, y: 49 }, { x: 75, y: 37 }, { x: 91, y: 48 }];
export default function JourneyMap({ quest, expanded, onSelect }: { quest: LongQuest; expanded: boolean; onSelect: (id: string) => void }) {
  const [segment, setSegment] = useState(0);
  const [missing, setMissing] = useState(false);
  const [active, setActive] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const count = Math.max(1, Math.ceil(quest.stages.length / 5));
  const page = Math.min(segment, count - 1);
  const stages = quest.stages.slice(page * 5, page * 5 + 5);
  const next = quest.stages.findIndex(s => !s.done);
  const heroIndex = Math.min(4, Math.max(0, (next < 0 ? quest.stages.length - 1 : next) - page * 5));
  const progressSegment = Math.floor(Math.max(0, next < 0 ? quest.stages.length - 1 : next) / 5);
  useEffect(() => { setSegment(progressSegment); }, [progressSegment]);
  useEffect(() => {
    let intersecting = true;
    const visibility = () => setActive(intersecting && !document.hidden);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => { intersecting = entries[0].isIntersecting; visibility(); });
    if (root.current) observer?.observe(root.current);
    document.addEventListener('visibilitychange', visibility);
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return <div ref={root} className={`journey ${expanded ? 'is-expanded' : ''} ${active ? '' : 'is-paused'}`} style={{ '--journey-color': STAT_COLORS[quest.stat] } as React.CSSProperties}>
    <div className="journey-map" role="group" aria-label={`${quest.name} journey map`}>
      {/* Decorative: the checkpoints carry the information, so the painting is hidden from assistive technology. */}
      {!missing && <img className="journey-terrain" src="/art/journey-terrain.webp" alt="" onError={() => setMissing(true)} />}
      {/* The map stretches a 100x100 viewBox over a wide, short box, so strokes must not scale or the route becomes a hairline. */}
      <svg className="journey-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={ROUTE} fill="none" stroke="#04141a" strokeOpacity=".6" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={ROUTE} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 8" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The wrapper covers the map and is translated by percentages of its own size, so the travel runs on the compositor. */}
      {!!stages.length && <div className="journey-hero-track" style={{ transform: `translate(${POINTS[heroIndex].x}%, ${POINTS[heroIndex].y}%)` }}><img className="journey-hero" src="/art/journey-hero.webp" alt="" /></div>}
      {stages.map((stage, index) => {
        const sequence = stageSequenceState(quest.stages, page * 5 + index);
        const state = stage.done ? 'Completed' : sequence.locked ? 'Locked' : 'Available';
        return <button key={stage.id} className={`journey-checkpoint ${state.toLowerCase()}`} style={{ left: `${POINTS[index].x}%`, top: `${POINTS[index].y}%` }} aria-label={`Map checkpoint ${page * 5 + index + 1}: ${stage.name}. ${state}${sequence.locked ? '. ' + sequence.reason : ''}`} title={stage.name} onClick={() => onSelect(stage.id)}>
          <span className="journey-checkpoint-icon">{stage.done ? <CheckIcon /> : sequence.locked ? '◇' : page * 5 + index + 1}</span><small>{state}</small>
        </button>;
      })}
      {!stages.length && <p className="journey-repair">Add a stage to begin this journey.</p>}
    </div>
    {expanded && count > 1 && <nav className="list-pagination" aria-label={`${quest.name} journey segments`}><button className="btn-secondary" disabled={!page} onClick={() => setSegment(page - 1)}>Previous segment</button><span>Segment {page + 1} / {count}</span><button className="btn-secondary" disabled={page === count - 1} onClick={() => setSegment(page + 1)}>Next segment</button></nav>}
  </div>;
}
