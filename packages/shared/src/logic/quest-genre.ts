import type { QuestGenre } from '../types/eiyu';

/** The fixed genre list, in the order the quest form shows it. */
export const QUEST_GENRES: readonly { id: QuestGenre; label: string }[] = [
  { id: 'tool', label: 'Tool' },
  { id: 'concept', label: 'Concept' },
  { id: 'article', label: 'Docs / article' },
  { id: 'software_idea', label: 'Software idea' },
  { id: 'todo', label: 'To-do' },
];

export function questGenreLabel(genre: QuestGenre | null | undefined): string | null {
  return QUEST_GENRES.find(item => item.id === genre)?.label ?? null;
}
