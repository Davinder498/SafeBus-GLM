#!/usr/bin/env node
// Protected, schema-first district agreement release. No commercial approval is implied.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { assertReviewedCheckout, verifiedDatabaseClient } from './lib/security-workflow-evidence.mjs';
import { createEnvironmentBinding, assertEnvironmentIdentity } from './lib/environment-identity.mjs';
import { readCommittedManifest } from './lib/migrations.mjs';
import {
  readObservedContract,
  validateObservedContract,
  inspectSecurityInstallation,
  contractDigest,
} from './lib/observed-production-baseline.mjs';
import { calculateSchemaFingerprint } from './lib/schema-fingerprint.mjs';

const REPO = 'Davinder498/SafeBus-GLM';
const PROJECT = 'ckrkfylsyihwouvesypm';
const SOURCE = 'supabase/migrations/pending/20261107121500_district_agreement_workflow.sql';
const TABLES = [
  'students','guardians','drivers','buses','schools','routes','route_stops',
  'route_service_days','route_trip_patterns','route_trip_stop_schedules','route_shapes',
  'student_guardians','student_bus_assignments','student_route_assignments',
  'student_qr_credentials','bus_qr_credentials','bus_admin_details',
  'bus_route_assignments','bus_run_dispatches','bus_tracking_sessions',
  'driver_route_assignments','driver_tracking_devices','driver_trips',
  'driver_trip_location_updates','driver_trip_current_locations',
  'student_trip_events','trip_exceptions','trip_operational_statuses',
  'pre_trip_confirmations','operational_notes','bulk_import_batches',
  'bulk_import_staging','guardian_notification_outbox',
  'push_notification_outbox','sis_integration_configs',
];

const mode = process.argv[2];
const sha = process.env.SAFEBUS_RELEASE_SHA;
let client;
let stage = 'context';
let commitAttempted = false;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const workflowRun = async (runId, workflow) => {
  if (!/^[1-9][0-9]*$/.test(runId ?? '')) throw new Error('RELEASE_RUN_ID_REQUIRED');
  const run = JSON.parse(execFileSync('gh', ['api', 'repos/' + REPO + '/actions/runs/' + runId], {
    encoding: 'utf8', stdio: ['ignore','pipe','pipe'],
  }));
  const age = Date.now() - Date.parse(run.created_at);
  if (run.id?.toString() !== runId ||
      run.path !== '.github/workflows/' + workflow ||
      run.event !== 'workflow_dispatch' ||
      run.head_branch !== 'main' ||
      run.head_sha !== sha ||
      run.status !== 'completed' ||
      run.conclusion !== 'success' ||
      !Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000)
    throw new Error('RELEASE_EVIDENCE_NOT_CURRENT_OR_INVALID');
  return run;
};
async function checkBackup(runId) {
  await workflowRun(runId, 'backup-platform-recovery.yml');
  const artifacts = JSON.parse(execFileSync('gh', [
    'api','repos/' + REPO + '/actions/runs/' + runId + '/artifacts',
  ], {encoding:'utf8', stdio:['ignore','pipe','pipe']}));
  if (!artifacts.artifacts?.some((a) =>
    a.name === 'platform-recovery-' + sha + '-' + runId && !a.expired && a.size_in_bytes > 0))
    throw new Error('ENCRYPTED_BACKUP_ARTIFACT_MISSING');
}
async function snapshot(c) {
  const [state, targets, gates] = await Promise.all([
    c.query("select (select count(*)::int from public.tenants) as tenants, " +
      "(select count(*)::int from public.tenants where status='active') as active_tenants, " +
      "(select count(*)::int from public.profiles where role::text='tenant_admin' and status::text='active') as active_admins, " +
      "to_regclass('safebus_private.agreement_packages')::text as packages, " +
      "to_regclass('safebus_private.agreement_catalog')::text as catalog, " +
      "to_regprocedure('public.get_my_district_agreement()')::text as read_rpc, " +
      "to_regprocedure('public.district_agreement_billing_allowed(uuid)')::text as billing_rpc, " +
      "(select count(*)::int from safebus_release.observed_baselines) as observed_baselines"),
    c.query("select c.relname as table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
      "where n.nspname='public' and c.relkind in ('r','p') and " +
      "exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped) " +
      "and c.relname=any($1::text[]) order by c.relname", [TABLES]),
    c.query("select c.relname as table_name from pg_trigger t join pg_class c on c.oid=t.tgrelid " +
      "join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' " +
      "and t.tgname='district_contract_write_gate' and not t.tgisinternal order by c.relname"),
  ]);
  return {
    ...state.rows[0],
    target_tables: targets.rows.map(x=>x.table_name),
    gated_tables: gates.rows.map(x=>x.table_name),
  };
}
function verifyBefore(s) {
  if (s.tenants !== 3 || s.active_tenants !== 3 || s.active_admins !== 3 ||
      s.observed_baselines !== 1 ||
      s.packages !== null || s.catalog !== null || s.read_rpc !== null ||
      s.billing_rpc !== null || s.gated_tables.length !== 0 ||
      TABLES.some((name) => !s.target_tables.includes(name)))
    throw new Error('DISTRICT_AGREEMENT_LIVE_BASELINE_MISMATCH');
}
async function verifyAfter(c, before) {
  const state = await snapshot(c);
  if (state.tenants !== before.tenants || state.active_tenants !== before.active_tenants ||
      state.active_admins !== before.active_admins ||
      !state.packages || !state.catalog || !state.read_rpc || !state.billing_rpc ||
      state.gated_tables.length !== TABLES.length ||
      TABLES.some((name) => !state.gated_tables.includes(name)))
    throw new Error('DISTRICT_AGREEMENT_POST_INSTALL_MISMATCH');
  const q = await c.query(
    "select (select count(*)::int from safebus_private.tenant_agreement_requirement) as required_tenants, " +
    "(select count(*)::int from safebus_private.agreement_document_versions) as published_documents, " +
    "(select count(*)::int from safebus_private.agreement_packages) as issued_packages, " +
    "(select bool_and(relrowsecurity) from pg_class where oid = any(array[" +
      "'safebus_private.agreement_document_versions'::regclass," +
      "'safebus_private.agreement_catalog'::regclass," +
      "'safebus_private.agreement_packages'::regclass," +
      "'safebus_private.agreement_executed_artifacts'::regclass," +
      "'safebus_private.tenant_agreement_requirement'::regclass])) as private_rls, " +
    "has_function_privilege('anon','public.accept_my_district_agreement(uuid,text,text,text,boolean,boolean,boolean)','execute') as anon_sign_allowed, " +
    "has_function_privilege('authenticated','public.accept_my_district_agreement(uuid,text,text,text,boolean,boolean,boolean)','execute') as admin_sign_allowed, " +
    "has_function_privilege('authenticated','public.district_agreement_billing_allowed(uuid)','execute') as user_billing_allowed, " +
    "has_function_privilege('service_role','public.district_agreement_billing_allowed(uuid)','execute') as service_billing_allowed"
  );
  const s = q.rows[0];
  if (s.required_tenants !== 0 || s.published_documents !== 0 || s.issued_packages !== 0 ||
      s.private_rls !== true || s.anon_sign_allowed || !s.admin_sign_allowed ||
      s.user_billing_allowed || !s.service_billing_allowed)
    throw new Error('DISTRICT_AGREEMENT_ACCESS_CONTROL_FAILURE');
  return {tenantCount:state.tenants, gateCount:state.gated_tables.length,
    publishedDocuments:s.published_documents, preexistingGrandfathered:s.required_tenants===0};
}
// SafeBus uses an observed production adoption baseline from October 15.
// Later independently approved operational changes are not in the canonical
// migration ledger. The general release preflight intentionally rejects them.
// This protected ONE-migration workflow must instead verify the immutable
// observed-security provenance and release metadata, then seal a fresh *actual*
// fingerprint as part of its separate approved read-only rehearsal. Never change
// the historical baseline, rewrite its ledger, or assert historical execution.
async function verifyRegisteredBaseline(c,manifest,binding) {
  await c.query('begin transaction isolation level repeatable read read only');
  try {
    await c.query("set local statement_timeout='60s'; set local lock_timeout='1s'");
    const contract=await readObservedContract();
    const verified=validateObservedContract(contract,manifest,binding);
    await assertEnvironmentIdentity(c,binding);
    const registration=await c.query(
      "select contract_sha256,manifest_sha256,source_catalog_sha256,schema_fingerprint,registration_release_sha " +
      "from safebus_release.observed_baselines"
    );
    if (registration.rows.length!==1 ||
        registration.rows[0].contract_sha256!==contractDigest(contract) ||
        registration.rows[0].manifest_sha256!==contract.migrationManifestSha256 ||
        registration.rows[0].source_catalog_sha256!==contract.sourceCatalogSha256 ||
        registration.rows[0].schema_fingerprint!==contract.schemaFingerprint)
      throw new Error('DISTRICT_AGREEMENT_OBSERVED_BASELINE_REGISTRATION_MISMATCH');
    const [objects, checksums, deployed, retained] = await Promise.all([
      c.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
        "where n.nspname='safebus_release' and c.relkind in ('r','p','v','m','S','f') order by c.relname"),
      c.query("select filename,version,checksum,bytes,release_sha " +
        "from safebus_release.migration_checksums order by filename"),
      c.query("select count(*)::int as count from safebus_release.releases"),
      c.query("select c.relrowsecurity, " +
        "has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_access, " +
        "has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as authenticated_access " +
        "from pg_class c where c.oid=to_regclass('safebus_release.pickup_dropoff_event_copies')")
    ]);
    const expectedObjects=['environment_identity','migration_checksums','migration_dispositions',
      'observed_baselines','pickup_dropoff_event_copies','releases','security_installations'];
    if (JSON.stringify(objects.rows.map(x=>x.relname))!==JSON.stringify(expectedObjects) ||
        deployed.rows[0].count!==0 || retained.rows.length!==1 ||
        !retained.rows[0].relrowsecurity || retained.rows[0].anon_access ||
        retained.rows[0].authenticated_access)
      throw new Error('DISTRICT_AGREEMENT_RELEASE_METADATA_MISMATCH');
    const expected=verified.executed;
    if (checksums.rows.length!==expected.length ||
        checksums.rows.some(row=>{
          const item=expected.find(x=>x.filename===row.filename);
          return !item || row.version!==item.version || row.checksum!==item.sha256 ||
            Number(row.bytes)!==item.bytes || row.release_sha!==contract.sourceSecurityInstallation.releaseSha;
        }))
      throw new Error('DISTRICT_AGREEMENT_SECURITY_LEDGER_MISMATCH');
    await inspectSecurityInstallation(c,contract);
    const currentFingerprint=await calculateSchemaFingerprint(c);
    await c.query('rollback');
    return currentFingerprint;
  } catch(e) {
    await c.query('rollback').catch(()=>{});
    throw e;
  }
}
async function readOnlySnapshot(c) {
  await c.query('begin transaction isolation level repeatable read read only');
  try {
    await c.query("set local statement_timeout='15s'; set local lock_timeout='1s'");
    const result=await snapshot(c);
    await c.query('rollback');
    return result;
  } catch(e) {
    await c.query('rollback').catch(()=>{});
    throw e;
  }
}
async function writeOutcome(filename, value) {
  await fs.mkdir('.safebus-release/district-agreements',{recursive:true});
  await fs.writeFile('.safebus-release/district-agreements/'+filename,
    JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
try {
  assertReviewedCheckout(sha);
  if (process.env.GITHUB_REF !== 'refs/heads/main' ||
      process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
      !['rehearse','install'].includes(mode) ||
      !/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID??''))
    throw new Error('DISTRICT_AGREEMENT_RELEASE_CONTEXT');
  const expected = mode==='rehearse'?'REHEARSE_DISTRICT_AGREEMENTS':'INSTALL_DISTRICT_AGREEMENTS';
  if (process.env.SAFEBUS_AGREEMENT_CONFIRM !== expected)
    throw new Error('DISTRICT_AGREEMENT_RELEASE_CONFIRMATION');
  const binding=createEnvironmentBinding({
    environment:'production',
    databaseUrl:process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl:process.env.SUPABASE_URL,
  });
  if (binding.projectRefHash !== hash(PROJECT))
    throw new Error('DISTRICT_AGREEMENT_TARGET_MISMATCH');
  const sql=await fs.readFile(SOURCE,'utf8');
  if (!sql.includes('create trigger require_agreement_for_new_tenant') ||
      !sql.includes('create function public.district_agreement_billing_allowed'))
    throw new Error('DISTRICT_AGREEMENT_SOURCE_MISMATCH');
  const identity={releaseSha:sha,runId:process.env.GITHUB_RUN_ID,mode,
    sqlSha256:hash(sql),projectRefHash:binding.projectRefHash};
  client=verifiedDatabaseClient(process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,'safebus-district-agreements');
  await client.connect();
  await assertEnvironmentIdentity(client,binding);
  const lock=await client.query("select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as acquired");
  if (!lock.rows[0].acquired)throw new Error('DISTRICT_AGREEMENT_SCHEMA_LOCK_BUSY');
  stage='baseline';
  const manifest=await readCommittedManifest();
  const beforeFingerprint=await verifyRegisteredBaseline(client,manifest,binding);
  const before=await readOnlySnapshot(client);
  verifyBefore(before);
  if(mode==='rehearse'){
    stage='rehearse';
    await writeOutcome('rehearsal.json',{...identity,checkedAt:new Date().toISOString(),
      readOnly:true,isolatedMigrationReplayRequired:true,targetTables:before.target_tables.length,
      grandfatheredTenants:before.tenants,baselineFingerprint:beforeFingerprint,
      installAuthorized:false});
    console.log('District agreements read-only production rehearsal passed; no SQL applied.');
  } else {
    stage='recovery-evidence';
    if (process.env.SAFEBUS_RECOVERY_CONFIRM!=='RESTORE_VERIFIED_OFFSITE')
      throw new Error('DISTRICT_AGREEMENT_RECOVERY_ATTESTATION_REQUIRED');
    const backupRunId=process.env.SAFEBUS_BACKUP_RUN_ID;
    const rehearsalRunId=process.env.SAFEBUS_REHEARSAL_RUN_ID;
    if (!backupRunId || !rehearsalRunId || backupRunId===rehearsalRunId)
      throw new Error('DISTRICT_AGREEMENT_SEPARATE_EVIDENCE_REQUIRED');
    await checkBackup(backupRunId);
    await workflowRun(rehearsalRunId,'release-district-agreements.yml');
    const rehearsals=JSON.parse(execFileSync('gh', [
      'api','repos/' + REPO + '/actions/runs/' + rehearsalRunId + '/artifacts',
    ], {encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    const evidenceName='district-agreements-rehearse-'+sha+'-'+rehearsalRunId;
    if(!rehearsals.artifacts?.some(a=>
      a.name===evidenceName && !a.expired && a.size_in_bytes>0))
      throw new Error('DISTRICT_AGREEMENT_READ_ONLY_REHEARSAL_EVIDENCE_MISSING');
    // Verify the attested schema fingerprint inside the immutable Actions
    // artifact, not just the artifact name or previous successful run status.
    const evidenceDir='.safebus-release/district-agreements/previous-rehearsal';
    await fs.mkdir(evidenceDir,{recursive:true});
    execFileSync('gh',['run','download',rehearsalRunId,'--repo',REPO,
      '--name',evidenceName,'--dir',evidenceDir],{stdio:['ignore','pipe','pipe']});
    const evidence=JSON.parse(await fs.readFile(evidenceDir+'/rehearsal.json','utf8'));
    if (evidence.releaseSha!==sha || evidence.runId!==rehearsalRunId ||
        evidence.mode!=='rehearse' || evidence.sqlSha256!==identity.sqlSha256 ||
        evidence.projectRefHash!==identity.projectRefHash ||
        evidence.readOnly!==true || evidence.installAuthorized!==false ||
        !/^[0-9a-f]{64}$/.test(evidence.baselineFingerprint??'') ||
        evidence.baselineFingerprint!==beforeFingerprint ||
        evidence.targetTables!==TABLES.length ||
        evidence.grandfatheredTenants!==before.tenants)
      throw new Error('DISTRICT_AGREEMENT_REHEARSAL_BASELINE_DRIFT');
    stage='install';
    await client.query('begin');
    try {
      await client.query("set local lock_timeout='1s'; set local statement_timeout='30s'");
      verifyBefore(await snapshot(client));
      // Prevent drift between read-only rehearsal and the installation.
      if ((await calculateSchemaFingerprint(client))!==beforeFingerprint)
        throw new Error('DISTRICT_AGREEMENT_REHEARSAL_BASELINE_DRIFT');
      await client.query(sql);
      const verified=await verifyAfter(client,before);
      // The normal SafeBus release preflight checks the latest deployed
      // schema fingerprint. Register the exact post-migration fingerprint in
      // the same transaction, never as an out-of-band untracked schema change.
      const schemaFingerprint=await calculateSchemaFingerprint(client);
      await client.query(
        "insert into safebus_release.releases (release_sha,environment,status,schema_fingerprint) " +
        "values ($1,'production','deployed',$2)",
        [sha,schemaFingerprint],
      );
      verified.schemaFingerprint=schemaFingerprint;
      commitAttempted=true;
      await client.query('commit');
      stage='post-commit-verify';
      const post=await readOnlySnapshot(client);
      if (post.tenants!==before.tenants || post.gated_tables.length!==TABLES.length ||
          post.packages===null || post.billing_rpc===null)
        throw new Error('DISTRICT_AGREEMENT_POST_COMMIT_REVIEW_REQUIRED');
      const ledger=await client.query(
        "select schema_fingerprint from safebus_release.releases where release_sha=$1 and status='deployed'",
        [sha],
      );
      if (ledger.rows[0]?.schema_fingerprint!==verified.schemaFingerprint ||
          await calculateSchemaFingerprint(client)!==verified.schemaFingerprint)
        throw new Error('DISTRICT_AGREEMENT_REGISTERED_SCHEMA_DRIFT');
      await writeOutcome('installation.json',{...identity,verified,
        installedAt:new Date().toISOString(),backupRunId,rehearsalRunId,
        installCommitted:true,postCommitVerified:true});
      console.log('District agreement database installed and verified. Contracts remain unpublished.');
    } catch(e) {
      if(!commitAttempted)await client.query('rollback').catch(()=>{});
      throw e;
    }
  }
} catch(e) {
  const code=e.message && /^[A-Z_]+$/.test(e.message)?e.message:'DISTRICT_AGREEMENT_RELEASE_ERROR';
  console.error('District agreement release halted: stage='+stage+'; code='+code+
    (commitAttempted?'; commit outcome may require read-only inspection':''));
  process.exitCode=1;
} finally {
  await client?.end().catch(()=>{});
}
