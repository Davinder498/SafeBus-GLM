import { describe, expect, it } from 'vitest';
import { createLatestAgreementFileReader } from './latestAgreementFileReader';

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<string>((done, fail) => {
    resolve = done; reject = fail;
  });
  return { promise, resolve, reject };
}

describe('latest approved agreement document file reader', () => {
  it('accepts only the most recently selected file when reads complete out of order', async () => {
    const loader = createLatestAgreementFileReader();
    const first = deferred();
    const slow = loader.read({ text: () => first.promise });
    const latest = await loader.read({ text: async () => 'Approved newer MSA' });
    first.resolve('Stale older contract');
    expect(latest).toBe('Approved newer MSA');
    expect(await slow).toBeNull();
  });
  it('discards a pending file when the document category changes', async () => {
    const loader = createLatestAgreementFileReader();
    const file = deferred();
    const pending = loader.read({ text: () => file.promise });
    loader.invalidate();
    file.resolve('MSA content for the former document category');
    expect(await pending).toBeNull();
  });
  it('does not surface errors from a stale file or accept one after unmount', async () => {
    const loader = createLatestAgreementFileReader();
    const file = deferred();
    const pending = loader.read({ text: () => file.promise });
    loader.invalidate();
    file.reject(new Error('Old file read failed'));
    await expect(pending).resolves.toBeNull();
    await expect(loader.read({ text: async () => { throw new Error('network'); } }))
      .rejects.toThrow('Unable to read');
  });
});
