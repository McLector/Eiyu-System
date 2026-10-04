import { QUEST_GENRES, questGenreLabel } from '../quest-genre';

describe('quest genres', () => {
  it('lists the five genres in the order the form shows them', () => {
    expect(QUEST_GENRES.map(g => g.id)).toEqual(['tool', 'concept', 'article', 'software_idea', 'todo']);
  });
  it('labels a genre for display', () => {
    expect(questGenreLabel('article')).toBe('Docs / article');
    expect(questGenreLabel('software_idea')).toBe('Software idea');
    expect(questGenreLabel('todo')).toBe('To-do');
  });
  it('returns null for no genre or an unknown one instead of throwing', () => {
    expect(questGenreLabel(null)).toBeNull();
    expect(questGenreLabel(undefined)).toBeNull();
    expect(questGenreLabel('bogus' as never)).toBeNull();
  });
});
