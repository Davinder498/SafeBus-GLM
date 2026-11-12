import { requireTrackingLedger } from './tracking-release-lineage.mjs';

// Recognize only the exact reviewed, installed tracking delta. Reconstructing
// its predecessor happens in memory; no cron objects or ledger rows are changed.
export async function assertAgreementReleaseBaseline(client, registered, fingerprint, proof) {
  if (!registered) throw Error('AGREEMENT_RELEASE_BASELINE_MISSING');
  if (registered.schema_fingerprint === fingerprint) return null;
  if (
    registered.release_sha !== proof.precedingReleaseSha ||
    registered.schema_fingerprint !== proof.precedingFingerprint ||
    (await requireTrackingLedger(client, proof, 'initial')) !== fingerprint
  )
    throw Error('AGREEMENT_UNRELATED_SCHEMA_DRIFT');
  return {
    kind: 'reviewed-installed-tracking-delta',
    installationRunId: proof.installationRunId,
    precedingReleaseSha: proof.precedingReleaseSha,
    precedingFingerprint: proof.precedingFingerprint,
  };
}
