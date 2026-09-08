import { STAT_COLORS } from '@eiyu/shared';

import { CheckIcon, ScrollIcon, SparkleIcon, StarIcon, StatIcon, StatusIcon } from '../Icons';
import FireStreak from '../FireStreak';
import SignaturePanel from '../SignaturePanel';

interface Props { onGetStarted: () => void; }

const FEATURES = [
  {
    icon: <CheckIcon size={20} />,
    tint: 'var(--c-accent)',
    title: 'Daily Quests',
    desc: 'Turn habits into quests. Complete them to earn XP and level up your stats.',
  },
  {
    icon: <StatusIcon active />,
    tint: 'var(--c-accent)',
    title: 'Stat System',
    desc: 'Five attributes — STR, INT, DEX, WIS, CHA — each powered by the quests you assign.',
  },
  {
    icon: <StarIcon color="var(--c-accent)" size={20} />,
    tint: 'var(--c-accent)',
    title: 'Rank Up',
    desc: 'Climb from Rank E to the legendary Rank S as your overall level grows.',
  },
  {
    icon: <ScrollIcon active />,
    tint: 'var(--c-accent)',
    title: 'Long Quests',
    desc: 'Multi-stage goals for bigger ambitions. Track milestones toward any long-term project.',
  },
  {
    icon: <FireStreak size={22} />,
    tint: 'var(--c-fire-inner)',
    title: 'Streak Tracking',
    desc: 'Build daily streaks on your habits. Use Freeze Shields to protect streaks on off days.',
  },
  {
    icon: <SparkleIcon size={20} />,
    tint: 'var(--c-accent)',
    title: 'Weekly Review',
    desc: 'Visualize your week at a glance with per-stat bar charts and an AI analysis summary.',
  },
];

const DEMO_QUESTS = [
  { name: 'Morning run', stat: 'STR' as const, difficulty: 'Medium', completed: true, streak: 12 },
  { name: 'Read 20 pages', stat: 'INT' as const, difficulty: 'Easy', completed: false, streak: 0 },
  { name: 'Deep work session', stat: 'WIS' as const, difficulty: 'Hard', completed: false, streak: 0 },
];

function DemoQuestRow({ quest, isFirst }: { quest: (typeof DEMO_QUESTS)[number]; isFirst: boolean }) {
  const color = STAT_COLORS[quest.stat];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
      borderTop: isFirst ? 'none' : '1px solid var(--c-divider-flat)',
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
        background: quest.completed ? 'rgba(74,222,128,0.18)' : 'transparent',
        border: `1.5px solid ${quest.completed ? 'rgba(74,222,128,0.5)' : color + '55'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {quest.completed && <CheckIcon />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: quest.completed ? 'var(--c-muted-flat)' : 'var(--c-text)', textDecoration: quest.completed ? 'line-through' : 'none' }}>
          {quest.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <StatIcon stat={quest.stat} size={12} />
          <span style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, color, letterSpacing: '0.08em' }}>{quest.stat}</span>
          <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-dim-flat)' }}>{quest.difficulty}</span>
          {quest.streak > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'JetBrains Mono', fontSize: 10, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 4, padding: '1px 5px' }}>
              <FireStreak size={11} /> {quest.streak}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Landing({ onGetStarted }: Props) {
  return (
    <div className="surface-flat" style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav bar */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
        background: 'var(--c-nav)',
        borderBottom: '1px solid var(--c-nav-border)',
        padding: '0 40px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'var(--c-accent-glass)', border: '1.5px solid var(--c-accent-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 700, color: 'var(--c-accent)',
          }}>英</div>
          <span style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.1em' }}>EIYU SYSTEM</span>
        </div>
        <button onClick={onGetStarted} className="btn-ghost" style={{ padding: '8px 22px', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.1em' }}>
          ENTER SYSTEM
        </button>
      </header>

      {/* Hero */}
      <section style={{ paddingTop: 140, paddingBottom: 100, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Glow orbs */}
        <div style={{ position: 'absolute', top: '10%', left: '20%', width: 500, height: 500, background: 'radial-gradient(circle, var(--c-accent-glass) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '20%', right: '15%', width: 300, height: 300, background: 'radial-gradient(circle, rgba(192,132,252,0.06) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto', padding: '0 24px' }}>
          <h1 style={{ fontFamily: 'Rajdhani', fontSize: 64, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', lineHeight: 1.05, margin: '0 0 20px' }}>
            Your habits.<br />
            <span style={{ color: 'var(--c-accent)' }}>Your stats.</span>
          </h1>

          <p style={{ fontFamily: 'Inter', fontSize: 17, color: 'var(--c-muted-flat)', lineHeight: 1.65, margin: '0 auto 36px', maxWidth: 520 }}>
            Eiyu System makes habit-building feel rewarding — track daily quests, grow five personal attributes, and watch your rank rise as you show up.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onGetStarted} className="btn-ghost" style={{ padding: '14px 32px', fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.1em' }}>
              BEGIN YOUR JOURNEY →
            </button>
            <a href="#features" style={{ padding: '14px 28px', borderRadius: 50, border: '1px solid var(--c-glass-border)', fontFamily: 'Inter', fontSize: 14, color: 'var(--c-muted-flat)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              See how it works
            </a>
          </div>
        </div>

        {/* Live quest-row demo — the one signature panel on this screen */}
        <div style={{ marginTop: 64, display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
          <SignaturePanel style={{ padding: '8px 24px', width: '100%', maxWidth: 420, textAlign: 'left' }}>
            {DEMO_QUESTS.map((q, i) => (
              <DemoQuestRow key={q.name} quest={q} isFirst={i === 0} />
            ))}
          </SignaturePanel>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: '80px 40px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontFamily: 'Rajdhani', fontSize: 38, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', margin: '0 0 44px', textAlign: 'center' }}>
          Everything you need to level up
        </h2>

        <div>
          {FEATURES.map((f, i) => (
            <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 18, padding: '20px 0', borderTop: i === 0 ? 'none' : '1px solid var(--c-divider-flat)' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: 'var(--c-accent-glass)', border: '1.5px solid var(--c-accent-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: f.tint,
              }}>
                {f.icon}
              </div>
              <div>
                <h3 style={{ fontFamily: 'Rajdhani', fontSize: 17, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', margin: '0 0 4px' }}>{f.title}</h3>
                <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted-flat)', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '60px 40px 80px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontFamily: 'Rajdhani', fontSize: 38, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', margin: '0 0 44px', textAlign: 'center' }}>
          How it works
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { n: '01', title: 'Create quests', body: 'Assign each habit or task to one of your five attributes. Set a difficulty and schedule — daily, weekdays, or custom.' },
            { n: '02', title: 'Complete daily', body: 'Check off quests each day. Earn XP in the matching attribute. Build streaks to accelerate your growth.' },
            { n: '03', title: 'Watch your rank climb', body: 'As your stat levels rise your overall rank advances — from E all the way to the coveted S rank.' },
            { n: '04', title: 'Review & adapt', body: 'Check the weekly radar chart and AI analysis to see where you are strong and where to push harder.' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 24, padding: '28px 0', borderTop: i > 0 ? '1px solid var(--c-divider-flat)' : 'none' }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 32, fontWeight: 600, color: 'var(--c-accent)', opacity: 0.3, flexShrink: 0, lineHeight: 1.1 }}>{step.n}</div>
              <div>
                <h3 style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', margin: '0 0 6px' }}>{step.title}</h3>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--c-muted-flat)', lineHeight: 1.65, margin: 0 }}>{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '60px 40px 100px', textAlign: 'center' }}>
        <div className="panel-flat" style={{ maxWidth: 540, margin: '0 auto', padding: '48px 40px' }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 36, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', marginBottom: 14 }}>
            Ready to ascend?
          </div>
          <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--c-muted-flat)', lineHeight: 1.6, marginBottom: 28 }}>
            Build better habits. See the progress. Stay consistent.
          </p>
          <button onClick={onGetStarted} className="btn-ghost" style={{ width: '100%', padding: '16px', fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.1em' }}>
            START FOR FREE →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '20px 40px', borderTop: '1px solid var(--c-divider-flat)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-dim-flat)', letterSpacing: '0.1em' }}>EIYU SYSTEM</span>
        <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)' }}>Built for the ascent</span>
      </footer>
    </div>
  );
}
