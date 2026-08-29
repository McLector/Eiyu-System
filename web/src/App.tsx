import { useEffect, useState } from 'react';
import { useSession } from './hooks/useSession';
import { useEiyu } from './store/eiyu-store';
import DevAuth from './DevAuth';
import Sidebar, { type Screen } from './web/Sidebar';
import Landing from './web/Landing';
import WebBoard from './web/WebBoard';
import WebStatus from './web/WebStatus';
import WebLongQuests from './web/WebLongQuests';
import WebSettings from './web/WebSettings';
import WebQuestEditor from './web/WebQuestEditor';
import WebHistory from './web/WebHistory';

export default function App() {
  const { session, loading: sessionLoading } = useSession();
  const { user } = useEiyu();
  const [stage, setStage] = useState<'landing' | 'auth' | 'app'>('landing');
  const [darkMode, setDarkMode] = useState(true);
  const [screen, setScreen] = useState<Screen>('board');
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    setStage(session ? 'app' : 'landing');
  }, [sessionLoading, session]);

  const editingQuest = editingId ? user.quests.find(q => q.id === editingId) ?? null : null;

  return (
    <div
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ background: 'var(--c-page)', minHeight: '100svh', position: 'relative' }}
    >
      {/* Fixed gradient background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, background: 'var(--c-page)' }} />

      {stage === 'landing' ? (
        <Landing onGetStarted={() => setStage('auth')} />
      ) : stage === 'auth' ? (
        <DevAuth onAuthenticated={() => setStage('app')} />
      ) : (
        <>
          <Sidebar current={screen} onChange={setScreen} />

          {/* Main content */}
          <main style={{ marginLeft: 220, minHeight: '100svh', padding: '36px 40px' }}>
            {screen === 'board' && (
              <WebBoard
                onNewQuest={() => { setEditingId(null); setShowEditor(true); }}
                onEditQuest={id => { setEditingId(id); setShowEditor(true); }}
              />
            )}
            {screen === 'status' && (
              <WebStatus darkMode={darkMode} />
            )}
            {screen === 'longquests' && (
              <WebLongQuests />
            )}
            {screen === 'settings' && (
              <WebSettings
                darkMode={darkMode}
                onToggleDark={() => setDarkMode(d => !d)}
                onShowHistory={() => setShowHistory(true)}
                onLogout={() => setStage('landing')}
              />
            )}
          </main>

          {/* Modals */}
          {showEditor && (
            <WebQuestEditor
              editingQuest={editingQuest}
              onClose={() => { setShowEditor(false); setEditingId(null); }}
            />
          )}
          {showHistory && <WebHistory onClose={() => setShowHistory(false)} />}
        </>
      )}
    </div>
  );
}
