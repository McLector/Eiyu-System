import { createBrowserRouter, Navigate } from 'react-router-dom';

import RootPage from './RootPage';
import RequireAuth from './RequireAuth';
import ProtectedLayout from './ProtectedLayout';
import AuthPage from './pages/AuthPage';
import BoardPage from './pages/BoardPage';
import StatusPage from './pages/StatusPage';
import WebLongQuests from './web/WebLongQuests';
import SettingsPage from './pages/SettingsPage';
import HistoryPage from './pages/HistoryPage';
import QuestEditorPage from './pages/QuestEditorPage';

export const router = createBrowserRouter([
  { path: '/', element: <RootPage /> },
  { path: '/auth', element: <AuthPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <ProtectedLayout />,
        children: [
          { path: '/board', element: <BoardPage /> },
          { path: '/status', element: <StatusPage /> },
          { path: '/longquests', element: <WebLongQuests /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '/history', element: <HistoryPage /> },
          { path: '/quest-editor/:id?', element: <QuestEditorPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
