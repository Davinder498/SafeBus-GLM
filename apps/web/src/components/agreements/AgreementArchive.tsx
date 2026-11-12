import { useState } from 'react';
import { Download } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  downloadExecutedAgreementPdf,
  downloadExecutedAgreementArchive,
  type AgreementReceiptSummary,
} from '@/services/districtAgreementService';

export function AgreementArchive({
  receipts,
  loading = false,
  error,
  onRetry,
}: {
  receipts: AgreementReceiptSummary[];
  loading?: boolean;
  error?: string | null;
  onRetry: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  async function download(id: string, exact = false) {
    if (busy) return;
    setBusy(id);
    setDownloadError(null);
    try {
      if (exact) await downloadExecutedAgreementArchive(id);
      else await downloadExecutedAgreementPdf(id);
    } catch (cause) {
      setDownloadError(
        cause instanceof Error ? cause.message : 'Unable to download the agreement. Please retry.',
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card className="space-y-4 p-5" data-ui="agreement-archive">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--color-heading)]">Accepted agreements</h2>
        <Button
          type="button"
          variant="outline"
          disabled={loading || Boolean(busy)}
          onClick={onRetry}
        >
          Refresh agreements
        </Button>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">
        Each copy contains the seven common documents and this school authority's accepted Order
        Form. Previous accepted versions remain available when new terms are issued.
      </p>
      {loading ? (
        <p role="status">Loading accepted agreements…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : receipts.length === 0 ? (
        <p>No accepted agreement is available yet.</p>
      ) : (
        receipts.map((r) => (
          <div key={r.id} className="space-y-2 border-t border-[var(--color-border)] pt-3">
            <p className="text-sm font-semibold">
              Accepted {new Date(r.signed_at).toLocaleString('en-CA')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(busy)}
                onClick={() => void download(r.id)}
                leftIcon={<Download className="h-4 w-4" />}
              >
                Download executed PDF
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(busy)}
                onClick={() => void download(r.id, true)}
                leftIcon={<Download className="h-4 w-4" />}
              >
                Download exact UTF-8 archive
              </Button>
            </div>
            <p className="break-all text-xs text-[var(--color-text-muted)]">
              Receipt: {r.receipt_sha256}
            </p>
          </div>
        ))
      )}
      {downloadError && <p role="alert">{downloadError}</p>}
      <p className="text-xs text-[var(--color-text-muted)]">
        The PDF is a printable copy. The UTF-8 archive preserves the exact accepted text, including
        accents and non-Latin characters.
      </p>
    </Card>
  );
}
