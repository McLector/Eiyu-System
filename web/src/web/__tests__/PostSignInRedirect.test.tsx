// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import PostSignInRedirect from '../PostSignInRedirect';

afterEach(cleanup);

function signIn(element = <PostSignInRedirect />) {
  const router = createMemoryRouter([
    { path: '/', element },
    { path: '/board', element: <p>BOARD</p> },
    { path: '/status', element: <p>STATUS</p> },
    { path: '/admin', element: <p>ADMIN ROUTE</p> },
  ], { initialEntries: ['/'] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('after sign-in', () => {
  it('goes to the Board straight away, with no operator lookup in between', () => {
    const router = signIn();
    expect(screen.getByText('BOARD')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/board');
    expect(screen.queryByText('ADMIN ROUTE')).not.toBeInTheDocument();
  });
  it('goes to the page the person came from', () => {
    signIn(<PostSignInRedirect fallback="/status" />);
    expect(screen.getByText('STATUS')).toBeInTheDocument();
  });
});
