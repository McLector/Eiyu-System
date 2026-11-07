import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '@eiyu/shared';

/**
 * Public copy of the Privacy Policy or Terms of Use, open to anyone at /privacy and /terms. The text is the
 * same shared content the sign-up dialogs show, so the public page and the app can never disagree.
 */
export default function LegalPage({ documentId }: { documentId: LegalDocumentId }) {
  const doc = LEGAL_DOCUMENTS[documentId];
  const other = LEGAL_DOCUMENTS[documentId === 'privacy' ? 'terms' : 'privacy'];

  useEffect(() => {
    const previous = document.title;
    document.title = `${doc.title} · Eiyu System`;
    return () => { document.title = previous; };
  }, [doc.title]);

  return (
    <div className="surface-flat" style={{ minHeight: '100svh' }}>
      <nav aria-label="Legal" style={{
        maxWidth: 720, margin: '0 auto', padding: '20px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <Link to="/" aria-label="Eiyu System home" style={{ fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.1em', textDecoration: 'none' }}>
          EIYU SYSTEM
        </Link>
        <Link to={`/${other.id}`} style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-accent-text)' }}>
          {other.title}
        </Link>
      </nav>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 80px' }}>
        <h1 style={{ fontFamily: 'Rajdhani', fontSize: 40, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em', margin: '0 0 32px' }}>
          {doc.title}
        </h1>
        {doc.sections.map(section => (
          <section key={section.heading} style={{ marginBottom: 28 }}>
            <h2 style={{ margin: '0 0 8px', fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: 'var(--c-accent-text)', letterSpacing: '0.1em' }}>
              {section.heading}
            </h2>
            <p style={{ margin: 0, fontFamily: 'Inter', fontSize: 15, lineHeight: 1.75, color: 'var(--c-muted-flat)', overflowWrap: 'anywhere' }}>
              {section.body}
            </p>
          </section>
        ))}
      </main>
    </div>
  );
}
