// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ useEiyu: vi.fn() }));
vi.mock('../../store/eiyu-store', () => ({ useEiyu: store.useEiyu }));

import LongQuestEditorDialog from '../LongQuestEditorDialog';

afterEach(cleanup);

describe('Long Quest editor density', () => {
  it('uses two-row stage description boxes so a few stages fit without scrolling', () => {
    store.useEiyu.mockReturnValue({ saveLongQuest: vi.fn() });
    render(<LongQuestEditorDialog onClose={vi.fn()} />);
    for (const box of screen.getAllByLabelText(/Stage \d description/)) expect(box).toHaveAttribute('rows', '2');
  });
});
