import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import RootPage from './RootPage';
import RequireAuth from './RequireAuth';
import ProtectedLayout from './ProtectedLayout';
import AuthPage from './pages/AuthPage';
import PasswordRecoveryPage from './pages/PasswordRecoveryPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import BoardPage from './pages/BoardPage';
import StatusPage from './pages/StatusPage';
import WebLongQuests from './web/WebLongQuests';
import SettingsPage from './pages/SettingsPage';
import HistoryPage from './pages/HistoryPage';
import QuestEditorPage from './pages/QuestEditorPage';
import WebGym from './web/WebGym';
import AdminPage from './pages/AdminPage';
import LegalPage from './pages/LegalPage';

export const routes: RouteObject[] = [
  { path: '/', element: <RootPage /> },
  // Public for everyone, signed in or not: Google's consent screen links here.
  { path: '/privacy', element: <LegalPage documentId="privacy" /> },
  { path: '/terms', element: <LegalPage documentId="terms" /> },
  { path: '/auth', element: <AuthPage /> },
  { path: '/auth/recovery', element: <PasswordRecoveryPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/admin', element: <AdminPage /> },
      {
        element: <ProtectedLayout />,
        children: [
          { path: '/board', element: <BoardPage /> },
          { path: '/status', element: <StatusPage /> },
          { path: '/longquests', element: <WebLongQuests /> },
          { path: '/gym', element: <WebGym /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '/history', element: <HistoryPage /> },
          { path: '/quest-editor/:id?', element: <QuestEditorPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
