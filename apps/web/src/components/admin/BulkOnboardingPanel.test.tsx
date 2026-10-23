import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkOnboardingPanel } from './BulkOnboardingPanel';
import {
  commitBulkImport,
  fetchBulkImportBatches,
  generateBulkInvitations,
  stageBulkImport,
} from '@/services/tenantAdminService';

vi.mock('@/services/tenantAdminService', () => ({
  fetchBulkImportBatches: vi.fn(async () => []),
  stageBulkImport: vi.fn(async () => ({
    batchId: 'batch-1',
    totalRows: 1,
    validRows: 1,
    errorRows: 0,
    dryRun: false,
    canCommit: true,
  })),
  commitBulkImport: vi.fn(async () => ({ committed: 1, requiresInvitations: true })),
  generateBulkInvitations: vi.fn(async () => ({ totalInvitations: 1 })),
  getBulkDeliverySummary: vi.fn(async () => ({ total: 1, queued: 1 })),
  fetchBulkInvitationDeliveryRows: vi.fn(async () => []),
  getBulkImportErrors: vi.fn(),
  rollbackBulkImport: vi.fn(),
}));
vi.mock('@/services/onboardingService', () => ({
  dispatchBulkInvitations: vi.fn(),
  updateInvitation: vi.fn(),
}));
vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn((_file, options) =>
      options.complete({
        data: [{ first_name: 'Morgan', last_name: 'Example', email: 'morgan@example.test' }],
        errors: [],
      }),
    ),
    unparse: vi.fn(),
  },
}));
vi.mock('./StudentCsvImportPanel', () => ({
  StudentCsvImportPanel: () => (
    <div data-testid="existing-student-import">Student CSV validation</div>
  ),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root | null = null;
const onImported = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

async function renderPanel(recordType: 'driver' | 'guardian' | 'student') {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <BulkOnboardingPanel recordType={recordType} onImported={onImported} onCancel={vi.fn()} />,
    ),
  );
  return container;
}

async function click(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label,
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

describe('directory bulk onboarding', () => {
  it.each(['driver', 'guardian', 'student'] as const)(
    'requests only %s import history',
    async (recordType) => {
      const container = await renderPanel(recordType);
      expect(fetchBulkImportBatches).toHaveBeenCalledWith(recordType);
      expect(container.querySelector('#record-type')).toBeNull();
      expect(commitBulkImport).not.toHaveBeenCalled();
      expect(generateBulkInvitations).not.toHaveBeenCalled();
    },
  );

  it('keeps the existing student CSV validation flow', async () => {
    const container = await renderPanel('student');
    expect(container.querySelector('[data-testid="existing-student-import"]')).not.toBeNull();
    expect(container.querySelector('#csv-file')).toBeNull();
  });

  it('stages guardians and requires confirmation before committing and queueing invitations', async () => {
    const container = await renderPanel('guardian');
    const fileInput = container.querySelector<HTMLInputElement>('#csv-file')!;
    Object.defineProperty(fileInput, 'files', {
      value: [new File(['first_name\nMorgan'], 'guardians.csv')],
    });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => container.querySelector<HTMLInputElement>('#dry-run')?.click());
    await click(container, 'Validate and stage');
    expect(stageBulkImport).toHaveBeenCalledWith(
      'guardian',
      expect.any(Array),
      'guardians.csv',
      false,
    );
    await click(container, 'Commit 1 record(s)');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(commitBulkImport).not.toHaveBeenCalled();
    await click(container, 'Commit records');
    expect(commitBulkImport).toHaveBeenCalledWith('batch-1');
    expect(generateBulkInvitations).toHaveBeenCalledWith('batch-1');
    expect(onImported).toHaveBeenCalledWith(1);
    expect(container.textContent).toContain('Send next 10 invitations');
  });

  it('shows a retry when history cannot be loaded', async () => {
    vi.mocked(fetchBulkImportBatches).mockRejectedValueOnce(new Error('offline'));
    const container = await renderPanel('driver');
    expect(container.textContent).toContain('Unable to load import history');
    await click(container, 'Retry history');
    expect(fetchBulkImportBatches).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('No imports yet.');
  });
});
