import { readBatches } from '../pagination';

it('reads across the 1000 row API boundary using stable bounded ranges', async () => {
  const rows = Array.from({ length: 1207 }, (_, id) => ({ id }));
  const read = jest.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
  expect(await readBatches(read)).toEqual(rows);
  expect(read.mock.calls).toEqual([[0,499],[500,999],[1000,1499]]);
});
it('propagates a failed later page instead of returning truncated data', async () => {
  const read = jest.fn().mockResolvedValueOnce({ data: new Array(500).fill(0), error: null }).mockResolvedValueOnce({ data: null, error: new Error('page unavailable') });
  await expect(readBatches(read)).rejects.toThrow('page unavailable');
});
