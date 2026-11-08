/**
 * The new participant Terms UI is staged until its protected migration is
 * installed, final terms are published, and hosted sign-in is verified.
 * This default prevents a Netlify main-branch auto-deploy from locking out
 * current drivers/guardians while the production RPC is still absent.
 * Enable only in a separately reviewed post-install application release.
 */
export const participantAgreementOnboardingEnabled = false;
