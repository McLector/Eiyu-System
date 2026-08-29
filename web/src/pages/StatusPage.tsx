import { useOutletContext } from 'react-router-dom';

import WebStatus from '../web/WebStatus';
import type { LayoutContext } from '../ProtectedLayout';

export default function StatusPage() {
  const { darkMode } = useOutletContext<LayoutContext>();
  return <WebStatus darkMode={darkMode} />;
}
