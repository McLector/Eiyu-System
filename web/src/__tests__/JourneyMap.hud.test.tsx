// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import JourneyMap from '../components/JourneyMap';

afterEach(cleanup);
const quest = (stages: number, done = 0) => ({
  id: 'q', name: 'Vault', stat: 'INT', description: null, completed_at: null,
  stages: Array.from({ length: stages }, (_, i) => ({ id: `s${i}`, name: `Step ${i + 1}`, done: i < done, position: i, description: null })),
}) as never;

it('treats the painted terrain as decoration, because the checkpoints carry the information', () => {
  const { container } = render(<JourneyMap quest={quest(3)} expanded onSelect={() => {}} />);
  const terrain = container.querySelector('img.journey-terrain')!;
  expect(terrain).toHaveAttribute('alt', '');
});

it('groups the map under a name that says what it is', () => {
  render(<JourneyMap quest={quest(3)} expanded onSelect={() => {}} />);
  expect(screen.getByRole('group', { name: 'Vault journey map' })).toBeInTheDocument();
});

it('names each checkpoint as a map point with its position, state and stage', () => {
  render(<JourneyMap quest={quest(3, 1)} expanded onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: 'Map checkpoint 1: Step 1. Completed' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Map checkpoint 2: Step 2. Available' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Map checkpoint 3: Step 3\. Locked/ })).toBeInTheDocument();
});

it('numbers checkpoints across segments, not from 1 on every segment', () => {
  render(<JourneyMap quest={quest(7, 5)} expanded onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: 'Map checkpoint 6: Step 6. Available' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Map checkpoint 7: Step 7\./ })).toBeInTheDocument();
});

it('keeps checkpoint names distinct from checklist rows so a name never matches two controls', () => {
  render(<JourneyMap quest={quest(2)} expanded onSelect={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Step 1. Available' })).toBeNull();
});

it('keeps the empty journey free of checkpoints and the hero', () => {
  const { container } = render(<JourneyMap quest={quest(0)} expanded onSelect={() => {}} />);
  expect(container.querySelectorAll('.journey-checkpoint')).toHaveLength(0);
  expect(container.querySelector('.journey-hero')).toBeNull();
  expect(screen.getByText('Add a stage to begin this journey.')).toBeInTheDocument();
});
