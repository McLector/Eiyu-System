// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '@eiyu/shared';

import LegalPage from '../LegalPage';

afterEach(cleanup);

function visit(id: LegalDocumentId) {
  return render(<MemoryRouter><LegalPage documentId={id} /></MemoryRouter>);
}

describe.each(['privacy', 'terms'] as const)('%s page', id => {
  const doc = LEGAL_DOCUMENTS[id];

  it('shows the title as the one page heading', () => {
    visit(id);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(doc.title);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows every section heading and body word for word, in order', () => {
    visit(id);
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(headings).toEqual(doc.sections.map(s => s.heading));
    for (const section of doc.sections) expect(screen.getByText(section.body)).toBeInTheDocument();
  });

  it('names the browser tab after the document', () => {
    visit(id);
    expect(document.title).toBe(`${doc.title} · Eiyu System`);
  });

  it('links home and to the other document as real links', () => {
    visit(id);
    const nav = screen.getByRole('navigation', { name: 'Legal' });
    expect(within(nav).getByRole('link', { name: 'Eiyu System home' })).toHaveAttribute('href', '/');
    const other = id === 'privacy' ? LEGAL_DOCUMENTS.terms : LEGAL_DOCUMENTS.privacy;
    expect(within(nav).getByRole('link', { name: other.title })).toHaveAttribute('href', `/${other.id}`);
    expect(within(nav).queryByRole('link', { name: doc.title })).not.toBeInTheDocument();
  });
});

it('gives the browser tab its earlier title back when the page closes', () => {
  document.title = 'Eiyu System';
  const { unmount } = visit('privacy');
  expect(document.title).toBe('Privacy Policy · Eiyu System');
  unmount();
  expect(document.title).toBe('Eiyu System');
});

it('does not show the other document\'s text', () => {
  visit('terms');
  expect(screen.queryByText(LEGAL_DOCUMENTS.privacy.sections[0].body)).not.toBeInTheDocument();
});
