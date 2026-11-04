const PROJECT_ID = 'ckrkfylsyihwouvesypm';
const BLOCKERS = [
  'legacy_auth_custom_roles',
  'objects_to_be_dropped',
  'unsupported_extensions',
  'user_defined_objects_in_internal_schemas',
  'validation_errors',
  'warnings',
];
export function summarizeUpgradeEligibility(value) {
  if (
    typeof value?.eligible !== 'boolean' ||
    !/^17\.\d+\.\d+\.\d+$/.test(value.current_app_version ?? '') ||
    !Array.isArray(value.target_upgrade_versions) ||
    !Number.isFinite(value.duration_estimate_hours) ||
    value.duration_estimate_hours < 0 ||
    BLOCKERS.some((key) => !Array.isArray(value[key]))
  )
    throw new Error('UPGRADE_PREFLIGHT_RESPONSE');
  // Retain counts, never internal object names or arbitrary provider response fields.
  const blockers = Object.fromEntries(BLOCKERS.map((key) => [key, value[key].length]));
  const targets = value.target_upgrade_versions
    .filter(
      (target) =>
        target?.postgres_version === '17' &&
        target.release_channel === 'ga' &&
        /^17\.\d+\.\d+\.\d+$/.test(target.app_version ?? '') &&
        Number(target.app_version.split('.')[1]) >= 11,
    )
    .map((target) => target.app_version);
  return {
    currentVersion: value.current_app_version,
    eligible: value.eligible,
    targetVersions: [...new Set(targets)].sort(),
    durationEstimateHours: value.duration_estimate_hours,
    blockerCounts: blockers,
    providerChecksClear:
      value.eligible && targets.length > 0 && Object.values(blockers).every((n) => n === 0),
    observationOnly: true,
    upgradeAuthorized: false,
  };
}
export async function inspectPostgresUpgrade({ projectId, token, fetchImpl = fetch }) {
  if (projectId !== PROJECT_ID || typeof token !== 'string' || !token.trim())
    throw new Error('UPGRADE_PREFLIGHT_TARGET_OR_ACCESS');
  let response;
  try {
    response = await fetchImpl(
      `https://api.supabase.com/v1/projects/${PROJECT_ID}/upgrade/eligibility`,
      {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      },
    );
  } catch {
    throw new Error('UPGRADE_PREFLIGHT_NETWORK');
  }
  if (!response.ok) throw new Error(`UPGRADE_PREFLIGHT_HTTP_${response.status}`);
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error('UPGRADE_PREFLIGHT_RESPONSE');
  }
  return summarizeUpgradeEligibility(value);
}
