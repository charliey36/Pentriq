import { fetchAll, chunkIds } from '../fetch-all';

const table = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
const source = (rows: Array<{ id: number }>) => async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null });

describe('fetchAll', () => {
  it('returns more than the 1000-row server cap', async () => {
    expect(await fetchAll(source(table(2500)))).toHaveLength(2500);
  });
  it('handles exact page multiples and empty tables', async () => {
    expect(await fetchAll(source(table(2000)))).toHaveLength(2000);
    expect(await fetchAll(source([]))).toEqual([]);
  });
  it('throws instead of returning a partial result when a page fails', async () => {
    let call = 0;
    await expect(fetchAll(async () => (++call === 2 ? { data: null, error: { message: 'boom' } } : { data: table(1000), error: null }))).rejects.toThrow('boom');
  });
  it('stops at the safety limit', async () => {
    expect((await fetchAll(async () => ({ data: table(10), error: null }), 10, 30))).toHaveLength(30);
  });
});

describe('chunkIds', () => {
  it('splits into bounded chunks', () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkIds([], 2)).toEqual([]);
  });
});
