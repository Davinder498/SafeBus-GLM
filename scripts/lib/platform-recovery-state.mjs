import { assertEnvironmentIdentity } from './environment-identity.mjs';
import { recoverySnapshot } from './existing-security-install.mjs';

// An observation for encrypted recovery, never acceptance of a release baseline.
// A backup must remain possible after adoption and after a discovered drift.
// The caller supplies a pinned production binding and a read-only transaction.
export async function observePlatformRecoveryCatalog(client, binding) {
  if (binding?.environment !== 'production')
    throw new Error('Platform recovery requires a production binding.');
  await assertEnvironmentIdentity(client, binding);
  return recoverySnapshot(client);
}

export function platformRecoveryAttestation() {
  return {
    purpose: 'postgres-platform-maintenance',
    catalogReviewRequired: true,
    baselineAccepted: false,
    upgradeAuthorized: false,
    fullRestoreVerified: false,
  };
}
