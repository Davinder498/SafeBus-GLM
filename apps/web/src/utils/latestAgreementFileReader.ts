/**
 * Discards stale asynchronous Markdown file reads. Approval of an immutable
 * contract must never use the content of a previously selected file.
 */
export function createLatestAgreementFileReader() {
  let revision = 0;
  return {
    invalidate(): void { revision += 1; },
    async read(file: Pick<File, 'text'>): Promise<string | null> {
      const selected = ++revision;
      try {
        const content = await file.text();
        return selected === revision ? content : null;
      } catch {
        if (selected !== revision) return null;
        throw new Error('Unable to read the selected agreement document.');
      }
    },
  };
}
