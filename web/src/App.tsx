import { useState } from 'react';
import { Screen, UserProfile, Quest } from './types';
import { initialUser } from './data';
import Sidebar from './web/Sidebar';
import Landing from './web/Landing';
import WebAuth from './web/WebAuth';
import WebBoard from './web/WebBoard';
import WebStatus from './web/WebStatus';
import WebLongQuests from './web/WebLongQuests';
import WebSettings from './web/WebSettings';
import WebQuestEditor from './web/WebQuestEditor';
import WebHistory from './web/WebHistory';

export default function App() {
  const [stage, setStage] = useState<'landing' | 'auth' | 'app'>('landing');
  const [darkMode, setDarkMode] = useState(true);
  const isLoggedIn = stage === 'app';
  const [screen, setScreen] = useState<Screen>('board');
  const [user, setUser] = useState<UserProfile>(initialUser);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const saveQuest = (quest: Quest) => {
    setUser(u => {
      const exists = u.quests.some(q => q.id === quest.id);
      return {
        ...u,
        quests: exists
          ? u.quests.map(q => q.id === quest.id ? quest : q)
          : [...u.quests, quest],
      };
    });
    setShowEditor(false);
    setEditingId(null);
  };

  const deleteQuest = (id: string) => {
    setUser(u => ({ ...u, quests: u.quests.filter(q => q.id !== id) }));
    setShowEditor(false);
    setEditingId(null);
  };

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
        <WebAuth onLogin={() => setStage('app')} />
      ) : (
        <>
          <Sidebar current={screen} onChange={setScreen} user={user} />

          {/* Main content */}
          <main style={{ marginLeft: 220, minHeight: '100svh', padding: '36px 40px' }}>
            {screen === 'board' && (
              <WebBoard
                user={user}
                setUser={setUser}
                onNewQuest={() => { setEditingId(null); setShowEditor(true); }}
                onEditQuest={id => { setEditingId(id); setShowEditor(true); }}
              />
            )}
            {screen === 'status' && (
              <WebStatus user={user} darkMode={darkMode} />
            )}
            {screen === 'longquests' && (
              <WebLongQuests user={user} setUser={setUser} />
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
              onSave={saveQuest}
              onDelete={editingId ? deleteQuest : undefined}
              onClose={() => { setShowEditor(false); setEditingId(null); }}
            />
          )}
          {showHistory && <WebHistory onClose={() => setShowHistory(false)} />}
        </>
      )}
    </div>
  );
}
