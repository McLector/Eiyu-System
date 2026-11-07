import { Navigate } from 'react-router-dom';

/** Where a signed-in person lands: the page they came from, or the Board. */
export default function PostSignInRedirect({ fallback = '/board' }: { fallback?: string }) {
  return <Navigate to={fallback} replace />;
}
