import fs from 'node:fs/promises';
import { fixture as lifecycle } from './retention-lifecycle-schema.mjs';
export const migrationPath =
  'supabase/migrations/pending/20261105194609_complete_automatic_disposal.sql';
export async function fixture(install = true) {
  const db = await lifecycle();
  await db.exec(`
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 INSERT INTO auth.users SELECT id FROM public.profiles;
 ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_fk FOREIGN KEY(id) REFERENCES auth.users(id) ON DELETE CASCADE;
 ALTER TABLE public.profiles ADD COLUMN updated_at timestamptz DEFAULT now(), ADD COLUMN first_name text, ADD COLUMN last_name text, ADD COLUMN full_name text, ADD COLUMN email text;
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY);
 CREATE TABLE public.students(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,status text,first_name text,last_name text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE public.guardians(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,status text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE public.drivers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,status text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE public.student_guardians(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,guardian_id uuid REFERENCES public.guardians(id) ON DELETE CASCADE,status text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE public.student_route_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid REFERENCES public.students(id) ON DELETE CASCADE);
 CREATE TABLE public.student_bus_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid REFERENCES public.students(id) ON DELETE CASCADE);
 CREATE TABLE public.student_qr_credentials(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL);
 CREATE TABLE public.driver_route_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),driver_id uuid REFERENCES public.drivers(id) ON DELETE CASCADE);
 CREATE TABLE public.driver_tracking_devices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),driver_id uuid REFERENCES public.drivers(id) ON DELETE CASCADE,profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE);
 ALTER TABLE public.driver_trips ADD COLUMN driver_id uuid REFERENCES public.drivers(id) ON DELETE CASCADE;
 ALTER TABLE public.student_trip_events ADD COLUMN student_id uuid REFERENCES public.students(id) ON DELETE CASCADE, ADD COLUMN tenant_id uuid,ADD COLUMN created_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
 CREATE TABLE public.tenant_onboarding_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,full_name text,status text,delivery_status text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),expires_at timestamptz,delivered_at timestamptz,last_sent_at timestamptz);
 CREATE TABLE public.bus_tracking_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,driver_trip_id uuid REFERENCES public.driver_trips(id) ON DELETE CASCADE,status text,created_at timestamptz DEFAULT now(),expires_at timestamptz,ended_at timestamptz,last_seen_at timestamptz);
 CREATE TABLE public.bus_run_dispatches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,driver_trip_id uuid REFERENCES public.driver_trips(id) ON DELETE RESTRICT,status text,prepared_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,claimed_at timestamptz);
 CREATE TABLE public.audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,actor_email text,actor_role text,target_type text,target_id uuid,target_label text,detail jsonb DEFAULT '{}',ip_address inet,created_at timestamptz DEFAULT now());
 CREATE TABLE public.rate_limit_buckets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),window_start timestamptz);
 CREATE TABLE public.user_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,revoked_at timestamptz,last_active_at timestamptz);
 ALTER TABLE public.user_notification_settings ADD CONSTRAINT pref_profile_fk FOREIGN KEY(profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
 ALTER TABLE public.user_notification_category_preferences ADD CONSTRAINT category_profile_fk FOREIGN KEY(profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
 CREATE TABLE public.android_push_devices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,status text,updated_at timestamptz DEFAULT now(),last_seen_at timestamptz DEFAULT now());
 ALTER TABLE public.push_notification_outbox ADD COLUMN device_id uuid REFERENCES public.android_push_devices(id) ON DELETE CASCADE;
 CREATE TABLE safebus_private.notification_audience_queue(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,driver_trip_id uuid REFERENCES public.driver_trips(id) ON DELETE CASCADE,failed_at timestamptz,occurred_at timestamptz DEFAULT now());
 CREATE TABLE public.driver_trip_current_locations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),driver_trip_id uuid REFERENCES public.driver_trips(id) ON DELETE CASCADE);
 CREATE TABLE public.pre_trip_confirmations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),driver_trip_id uuid REFERENCES public.driver_trips(id) ON DELETE CASCADE);
 `);
  await db.exec(`
    ALTER TABLE storage.objects ADD COLUMN owner uuid, ADD COLUMN owner_id text;
    ALTER TABLE public.audit_events ADD COLUMN action text NOT NULL DEFAULT 'auth.login' CHECK(action IN ('auth.login','security.config_changed','data.exported','retention.deletion_run'));
    DROP FUNCTION safebus_private.write_audit_event_legacy(text,text,uuid,text,text,jsonb,text);
    CREATE FUNCTION safebus_private.write_audit_event_legacy(text,text,uuid,text,text,jsonb,inet)
    RETURNS public.audit_events LANGUAGE sql AS $$INSERT INTO public.audit_events(action,target_type,target_id,detail) VALUES($1,$2,$3,$6) RETURNING *$$;
  `);
  // Inbound profile edges observed in BusSafe. Minimal fixture columns reproduce
  // the deployment trigger bindings without importing customer rows.
  const profileRefs = {
    'public.bulk_import_batches': ['created_by_profile_id'],
    'public.bus_qr_credentials': ['created_by', 'revoked_by'],
    'public.bus_run_dispatches': ['prepared_by'],
    'public.guardian_notification_delivery_policies': ['privacy_approved_by'],
    'public.guardian_notification_outbox': ['recipient_profile_id'],
    'public.operational_notes': ['created_by'],
    'public.platform_support_contacts': ['updated_by'],
    'public.retention_deletion_runs': ['actor_profile_id'],
    'public.route_shapes': ['created_by'],
    'public.sis_integration_configs': ['created_by_profile_id'],
    'public.tenant_lifecycle_snapshots': ['created_by_profile_id'],
    'public.tenant_onboarding_invitations': ['invited_profile_id', 'invited_by_profile_id'],
    'public.tenant_support_contacts': ['updated_by'],
    'public.trip_operational_statuses': ['set_by'],
    'public.user_notifications': ['recipient_profile_id'],
    'public.user_sessions': ['revoked_by'],
    'safebus_private.authority_announcements': ['sender_profile_id'],
    'safebus_private.billing_catalog_operations': ['actor_profile_id'],
    'safebus_private.billing_mutation_requests': ['actor_profile_id'],
    'safebus_private.tenant_subscription_exemptions': ['approved_profile_id'],
  };
  for (const [table, columns] of Object.entries(profileRefs)) {
    await db.exec(
      `CREATE TABLE IF NOT EXISTS ${table}(id uuid PRIMARY KEY DEFAULT gen_random_uuid());`,
    );
    for (const column of columns)
      await db.exec(
        `ALTER TABLE ${table} ADD COLUMN ${column} uuid REFERENCES public.profiles(id);`,
      );
  }
  if (install) await db.exec(await fs.readFile(migrationPath, 'utf8'));
  return db;
}
