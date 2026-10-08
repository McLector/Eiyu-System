import { WEEKLY_DAYS, WEEKLY_LABEL_WIDTH, weeklyColumnWidth } from '../weekly-columns';

/** Status content has 16 dp of horizontal padding on each side. */
const matrixWidth = (windowWidth: number) => windowWidth - 32;

describe('weeklyColumnWidth', () => {
  it('splits what is left after the label column across seven days, rounded down to half a dp', () => {
    expect(weeklyColumnWidth(288)).toBe(34.5); // (288 - 44) / 7 = 34.857
    expect(weeklyColumnWidth(360 - 32)).toBe(40.5); // 284 / 7 = 40.571
    expect(weeklyColumnWidth(412 - 32)).toBe(48); // 336 / 7 = 48
  });

  it('leaves a 320 dp phone a readable column that fits the container', () => {
    const column = weeklyColumnWidth(matrixWidth(320));
    expect(column).toBeGreaterThanOrEqual(32);
    expect(WEEKLY_LABEL_WIDTH + WEEKLY_DAYS * column).toBeLessThanOrEqual(matrixWidth(320));
  });

  it('never overflows its container at any width from 240 to 600 dp', () => {
    for (let width = 240; width <= 600; width += 0.5) {
      const column = weeklyColumnWidth(width);
      expect(WEEKLY_LABEL_WIDTH + WEEKLY_DAYS * column).toBeLessThanOrEqual(width);
    }
  });

  it('never gets narrower as the container grows', () => {
    let previous = 0;
    for (let width = 0; width <= 600; width += 1) {
      const column = weeklyColumnWidth(width);
      expect(column).toBeGreaterThanOrEqual(previous);
      previous = column;
    }
  });

  it('honours a custom label width and day count', () => {
    expect(weeklyColumnWidth(100, 4, 20)).toBe(20);
    expect(weeklyColumnWidth(100, 7, 30)).toBe(10);
  });

  it.each([
    ['a container equal to the label column', WEEKLY_LABEL_WIDTH],
    ['a container narrower than the label column', 30],
    ['zero', 0],
    ['a negative width', -50],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('returns 0 for %s', (_label, width) => {
    expect(weeklyColumnWidth(width)).toBe(0);
  });

  it.each([[0], [-3], [NaN], [Infinity]])('returns 0 instead of dividing by %s days', days => {
    expect(weeklyColumnWidth(300, days)).toBe(0);
  });

  it('returns 0 for a bad label width rather than a negative column', () => {
    expect(weeklyColumnWidth(300, 7, NaN)).toBe(0);
    expect(weeklyColumnWidth(300, 7, 400)).toBe(0);
  });
});
