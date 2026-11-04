const PROJECT_ID = 'ckrkfylsyihwouvesypm';
const BLOCKERS = [
  'legacy_auth_custom_roles',
  'objects_to_be_dropped',
  'unsupported_extensions',
  'user_defined_objects_in_internal_schemas',
  'validation_errors',
  'warnings',
];
// The provider defines current_app_version as a string, not four-part semver.
// Accept a bounded platform/image version label; never interpret it as readiness.
const platformVersion = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/.test(value);
// Supabase Studio strips this prefix for both current and target app versions.
const numericPlatformVersion = (value) => {
  if (typeof value !== 'string') return null;
  const numeric = value.replace(/^(?:supabase-postgres-|supabase\/postgres:)/, '');
  return /^\d+\.\d+(?:\.\d+){0,2}$/.test(numeric) ? numeric : null;
};
const fieldType = (value) =>
  value === undefined
    ? 'missing'
    : value === null
      ? 'null'
      : Array.isArray(value)
        ? 'array'
        : typeof value;
const RESPONSE_FIELDS = [
  'eligible',
  'current_app_version',
  'target_upgrade_versions',
  'duration_estimate_hours',
  ...BLOCKERS,
];

export function eligibilityResponseDiagnostics(value) {
  const failures = [];
  if (typeof value?.eligible !== 'boolean') failures.push('eligible');
  if (!platformVersion(value?.current_app_version)) failures.push('current_app_version');
  if (!Array.isArray(value?.target_upgrade_versions)) failures.push('target_upgrade_versions');
  if (!Number.isFinite(value?.duration_estimate_hours) || value.duration_estimate_hours < 0)
    failures.push('duration_estimate_hours');
  for (const key of BLOCKERS) if (!Array.isArray(value?.[key])) failures.push(key);
  return {
    responseType: fieldType(value),
    fieldTypes: Object.fromEntries(RESPONSE_FIELDS.map((key) => [key, fieldType(value?.[key])])),
    failedFields: failures,
  };
}

export function summarizeUpgradeEligibility(value) {
  const diagnostics = eligibilityResponseDiagnostics(value);
  if (diagnostics.failedFields.length)
    throw Object.assign(new Error('UPGRADE_PREFLIGHT_RESPONSE'), { diagnostics });
  // Retain counts, never internal object names or arbitrary provider response fields.
  const blockers = Object.fromEntries(BLOCKERS.map((key) => [key, value[key].length]));
  const currentNumeric = numericPlatformVersion(value.current_app_version);
  const currentMajorVerified = currentNumeric?.startsWith('17.') === true;
  const offeredTargets = value.target_upgrade_versions.filter((target) => {
    const numeric = numericPlatformVersion(target?.app_version);
    return (
      target?.postgres_version === '17' &&
      target.release_channel === 'ga' &&
      /^17\.\d+\.\d+\.\d+$/.test(numeric ?? '') &&
      Number(numeric.split('.')[1]) >= 11
    );
  });
  const targets = offeredTargets.map((target) => numericPlatformVersion(target.app_version));
  return {
    currentVersion: value.current_app_version,
    currentMajorVerified,
    eligible: value.eligible,
    targetVersions: [...new Set(targets)].sort(),
    targetPlatformVersions: [...new Set(offeredTargets.map((target) => target.app_version))].sort(),
    durationEstimateHours: value.duration_estimate_hours,
    blockerCounts: blockers,
    providerChecksClear:
      value.eligible &&
      currentMajorVerified &&
      targets.length > 0 &&
      Object.values(blockers).every((n) => n === 0),
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
    throw new Error('UPGRADE_PREFLIGHT_JSON');
  }
  return summarizeUpgradeEligibility(value);
}
