import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { initialUser } from '@/constants/eiyu-data';
import { darkTheme, lightTheme, type EiyuTheme } from '@/constants/eiyu-theme';
import { Quest, UserProfile } from '@/types/eiyu';

interface EiyuStore {
  user: UserProfile;
  theme: EiyuTheme;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  toggleQuest: (id: string) => void;
  saveQuest: (quest: Quest) => void;
  deleteQuest: (id: string) => void;
  toggleStage: (lqId: string, idx: number) => void;
}

const EiyuContext = createContext<EiyuStore | null>(null);

export function EiyuProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState(true);
  const [user, setUser] = useState<UserProfile>(initialUser);

  const toggleQuest = (id: string) => {
    setUser(u => ({
      ...u,
      quests: u.quests.map(q => (q.id === id ? { ...q, completed: !q.completed } : q)),
    }));
  };

  const saveQuest = (quest: Quest) => {
    setUser(u => {
      const exists = u.quests.some(q => q.id === quest.id);
      return {
        ...u,
        quests: exists
          ? u.quests.map(q => (q.id === quest.id ? quest : q))
          : [...u.quests, quest],
      };
    });
  };

  const deleteQuest = (id: string) => {
    setUser(u => ({ ...u, quests: u.quests.filter(q => q.id !== id) }));
  };

  const toggleStage = (lqId: string, idx: number) => {
    setUser(u => ({
      ...u,
      longQuests: u.longQuests.map(lq =>
        lq.id === lqId
          ? { ...lq, stages: lq.stages.map((s, i) => (i === idx ? { ...s, done: !s.done } : s)) }
          : lq
      ),
    }));
  };

  const value = useMemo<EiyuStore>(
    () => ({
      user,
      theme: darkMode ? darkTheme : lightTheme,
      darkMode,
      setDarkMode,
      toggleQuest,
      saveQuest,
      deleteQuest,
      toggleStage,
    }),
    [user, darkMode]
  );

  return <EiyuContext.Provider value={value}>{children}</EiyuContext.Provider>;
}

export function useEiyu() {
  const ctx = useContext(EiyuContext);
  if (!ctx) throw new Error('useEiyu must be used within EiyuProvider');
  return ctx;
}
