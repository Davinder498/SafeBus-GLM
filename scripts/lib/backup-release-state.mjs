import { RELEASE_STATE_SQL, recoverySnapshot } from './existing-security-install.mjs';
import { assertObservedSource, readObservedContract } from './observed-production-baseline.mjs';

// Extend the encrypted export to the exact reviewed post-security source only.
// Ordinary adoption/release metadata, unknown objects and schema drift still stop it.
export async function assertBackupReleaseState(client, contract = undefined) {
  const state = (await client.query(RELEASE_STATE_SQL)).rows[0];
  if (!state || ['identity', 'migrations', 'releases'].some((key) => state[key] !== false))
    throw new Error('This export requires an unadopted, reviewed source.');
  if (state.security_installation === false && state.release_objects === false)
    return recoverySnapshot(client);
  if (state.security_installation !== true || state.release_objects !== true)
    throw new Error('Unexpected release metadata before backup.');
  return assertObservedSource(client, contract ?? (await readObservedContract()));
}
