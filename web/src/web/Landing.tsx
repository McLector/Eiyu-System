interface Props { onGetStarted: () => void; }

const FEATURES = [
  {
    icon: '⚔️',
    title: 'Daily Quests',
    desc: 'Turn habits into quests. Complete them to earn XP and level up your stats.',
  },
  {
    icon: '📊',
    title: 'Stat System',
    desc: 'Five attributes — STR, INT, DEX, WIS, CHA — each powered by the quests you assign.',
  },
  {
    icon: '🏆',
    title: 'Rank Up',
    desc: 'Climb from Rank E to the legendary Rank S as your overall level grows.',
  },
  {
    icon: '📜',
    title: 'Long Quests',
    desc: 'Multi-stage goals for bigger ambitions. Track milestones toward any long-term project.',
  },
  {
    icon: '🔥',
    title: 'Streak Tracking',
    desc: 'Build daily streaks on your habits. Use Freeze Shields to protect streaks on off days.',
  },
  {
    icon: '📅',
    title: 'Weekly Review',
    desc: 'Visualize your week at a glance with per-stat bar charts and an AI analysis summary.',
  },
];

const STATS = [
  { label: 'STR', color: '#f87171', level: 12 },
  { label: 'INT', color: '#60a5fa', level: 28 },
  { label: 'DEX', color: '#fbbf24', level: 15 },
  { label: 'WIS', color: '#c084fc', level: 22 },
  { label: 'CHA', color: '#fb923c', level: 9 },
];

export default function Landing({ onGetStarted }: Props) {
  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav bar */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
        background: 'var(--c-nav)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
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
          <div style={{
            display: 'inline-block', marginBottom: 20,
            padding: '5px 14px', borderRadius: 50,
            background: 'var(--c-accent-glass)', border: '1px solid var(--c-accent-border)',
            fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.14em',
          }}>
            HABIT TRACKING, GAMIFIED
          </div>

          <h1 style={{ fontFamily: 'Rajdhani', fontSize: 64, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', lineHeight: 1.05, margin: '0 0 20px' }}>
            Your habits.<br />
            <span style={{ color: 'var(--c-accent)' }}>Your stats.</span>
          </h1>

          <p style={{ fontFamily: 'Inter', fontSize: 17, color: 'var(--c-muted)', lineHeight: 1.65, margin: '0 auto 36px', maxWidth: 520 }}>
            Eiyu System makes habit-building feel rewarding — track daily quests, grow five personal attributes, and watch your rank rise as you show up.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onGetStarted} className="btn-ghost" style={{ padding: '14px 32px', fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.1em' }}>
              BEGIN YOUR JOURNEY →
            </button>
            <a href="#features" style={{ padding: '14px 28px', borderRadius: 50, border: '1px solid var(--c-glass-border)', fontFamily: 'Inter', fontSize: 14, color: 'var(--c-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              See how it works
            </a>
          </div>
        </div>

        {/* Floating stat preview */}
        <div style={{ marginTop: 64, display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
          <div className="glass" style={{ padding: '20px 28px', display: 'inline-flex', gap: 32, alignItems: 'center' }}>
            {STATS.map(s => (
              <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 48, height: 48, position: 'relative' }}>
                  <svg width="48" height="48" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r="20" fill="none" stroke="var(--c-track)" strokeWidth="4" />
                    <circle
                      cx="24" cy="24" r="20" fill="none" stroke={s.color} strokeWidth="4"
                      strokeDasharray={`${(s.level / 30) * 125.6} 125.6`}
                      strokeLinecap="round" transform="rotate(-90 24 24)"
                      style={{ filter: `drop-shadow(0 0 4px ${s.color}88)` }}
                    />
                    <text x="24" y="29" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="13" fontWeight="600" fill={s.color}>{s.level}</text>
                  </svg>
                </div>
                <span style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: '0.1em' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: '80px 40px', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--c-dim)', marginBottom: 10 }}>SYSTEM FEATURES</div>
          <h2 style={{ fontFamily: 'Rajdhani', fontSize: 38, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', margin: 0 }}>Everything you need to level up</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {FEATURES.map(f => (
            <div key={f.title} className="glass" style={{ padding: '22px 22px 20px' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontFamily: 'Rajdhani', fontSize: 17, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', margin: '0 0 8px' }}>{f.title}</h3>
              <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted)', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '60px 40px 80px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--c-dim)', marginBottom: 10 }}>THE LOOP</div>
          <h2 style={{ fontFamily: 'Rajdhani', fontSize: 38, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', margin: 0 }}>How it works</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { n: '01', title: 'Create quests', body: 'Assign each habit or task to one of your five attributes. Set a difficulty and schedule — daily, weekdays, or custom.' },
            { n: '02', title: 'Complete daily', body: 'Check off quests each day. Earn XP in the matching attribute. Build streaks to accelerate your growth.' },
            { n: '03', title: 'Watch your rank climb', body: 'As your stat levels rise your overall rank advances — from E all the way to the coveted S rank.' },
            { n: '04', title: 'Review & adapt', body: 'Check the weekly radar chart and AI analysis to see where you are strong and where to push harder.' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 24, padding: '28px 0', borderTop: i > 0 ? '1px solid var(--c-glass-border)' : 'none' }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 32, fontWeight: 600, color: 'var(--c-accent)', opacity: 0.3, flexShrink: 0, lineHeight: 1.1 }}>{step.n}</div>
              <div>
                <h3 style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', margin: '0 0 6px' }}>{step.title}</h3>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.65, margin: 0 }}>{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '60px 40px 100px', textAlign: 'center' }}>
        <div className="glass" style={{ maxWidth: 540, margin: '0 auto', padding: '48px 40px' }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 36, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', marginBottom: 14 }}>
            Ready to ascend?
          </div>
          <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.6, marginBottom: 28 }}>
            Build better habits. See the progress. Stay consistent.
          </p>
          <button onClick={onGetStarted} className="btn-ghost" style={{ width: '100%', padding: '16px', fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.1em' }}>
            START FOR FREE →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '20px 40px', borderTop: '1px solid var(--c-glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-dim)', letterSpacing: '0.1em' }}>EIYU SYSTEM</span>
        <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim)' }}>Built for the ascent</span>
      </footer>
    </div>
  );
}
