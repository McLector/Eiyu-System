/** Rebuild the ordered query for every bounded request; never depend on the API default cap. */
export async function readBatches<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 500): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; ; from += size) {
    const page = await read(from, from + size - 1);
    if (page.error) throw page.error;
    result.push(...page.data ?? []);
    if ((page.data?.length ?? 0) < size) return result;
  }
}
