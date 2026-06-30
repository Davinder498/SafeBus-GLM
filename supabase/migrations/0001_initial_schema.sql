-- SafeBus Alberta — Initial schema migration
-- Phase 2 (Backend) — all 21 entity tables + 4 Alberta compliance tables
--
-- Principles:
--   - Every sensitive table has tenant_id + RLS policy
--   - UUIDs for all primary keys
--   - created_at/updated_at on all tables
--   - ASN stored as restricted metadata only, never as primary ID
--   - GPS tables use TimescaleDB hypertable for history

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";
-- TimescaleDB: enable when available in Supabase
-- create extension if not exists timescaledb;

-- ─── Tenants ───────────────────────────────────────────────────────────────

create table tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended')),
  settings jsonb not null default '{
    "privacy_regime": "pipa",
    "gps_retention_days": 30,
    "ping_interval_seconds": 5,
    "stale_threshold_seconds": 30,
    "lost_threshold_seconds": 60,
    "notification_channels": { "in_app": true, "push": true, "email": true }
  }'::jsonb,
  created_at timestamptz not null default now()
);

-- ─── Schools ───────────────────────────────────────────────────────────────

create table schools (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);
create index schools_tenant_id_idx on schools(tenant_id);

-- ─── Profiles ──────────────────────────────────────────────────────────────

create table profiles (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid not null unique,  -- references auth.users(id)
  tenant_id uuid references tenants(id) on delete cascade,
  role text not null check (role in (
    'platform_super_admin', 'tenant_admin', 'school_admin',
    'transportation_admin', 'driver', 'guardian'
  )),
  email text not null,
  full_name text not null,
  phone text,
  status text not null default 'invited' check (status in ('active', 'suspended', 'invited')),
  created_at timestamptz not null default now()
);
create index profiles_tenant_id_idx on profiles(tenant_id);
create index profiles_auth_user_id_idx on profiles(auth_user_id);

-- ─── Students ──────────────────────────────────────────────────────────────

create table students (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  grade text,
  -- Alberta Student Number — restricted metadata, never public/driver-facing
  asn_restricted text,
  status text not null default 'active' check (status in ('active', 'inactive', 'transferred')),
  created_at timestamptz not null default now()
);
create index students_tenant_id_idx on students(tenant_id);
create index students_school_id_idx on students(school_id);

-- ─── Guardians ─────────────────────────────────────────────────────────────

create table guardians (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now()
);
create index guardians_tenant_id_idx on guardians(tenant_id);

create table student_guardians (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  guardian_id uuid not null references guardians(id) on delete cascade,
  relationship text,
  created_at timestamptz not null default now(),
  unique(student_id, guardian_id)
);
create index student_guardians_student_id_idx on student_guardians(student_id);
create index student_guardians_guardian_id_idx on student_guardians(guardian_id);

-- ─── Buses & Drivers ──────────────────────────────────────────────────────

create table buses (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  bus_number text not null,
  capacity integer not null default 48,
  status text not null default 'active' check (status in ('active', 'maintenance', 'retired')),
  created_at timestamptz not null default now()
);
create index buses_tenant_id_idx on buses(tenant_id);

create table drivers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  license_number text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);
create index drivers_tenant_id_idx on drivers(tenant_id);
create index drivers_profile_id_idx on drivers(profile_id);

-- ─── Routes & Stops ───────────────────────────────────────────────────────

create table routes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  direction text not null check (direction in ('AM', 'PM')),
  created_at timestamptz not null default now()
);
create index routes_tenant_id_idx on routes(tenant_id);
create index routes_school_id_idx on routes(school_id);

create table route_stops (
  id uuid primary key default uuid_generate_v4(),
  route_id uuid not null references routes(id) on delete cascade,
  name text not null,
  sequence integer not null,
  latitude double precision not null,
  longitude double precision not null,
  scheduled_time time,
  created_at timestamptz not null default now()
);
create index route_stops_route_id_idx on route_stops(route_id);

create table student_route_assignments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  route_id uuid not null references routes(id) on delete cascade,
  stop_id uuid references route_stops(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(student_id, route_id)
);
create index student_route_assignments_student_id_idx on student_route_assignments(student_id);
create index student_route_assignments_route_id_idx on student_route_assignments(route_id);

-- ─── Trips & Live Location ────────────────────────────────────────────────

create table trips (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  route_id uuid not null references routes(id) on delete restrict,
  bus_id uuid not null references buses(id) on delete restrict,
  driver_id uuid not null references drivers(id) on delete restrict,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'active', 'delayed', 'completed', 'cancelled', 'gps_stale', 'gps_lost'
  )),
  scheduled_start timestamptz not null,
  actual_start timestamptz,
  actual_end timestamptz,
  trip_date date not null,
  created_at timestamptz not null default now()
);
create index trips_tenant_id_idx on trips(tenant_id);
create index trips_driver_id_idx on trips(driver_id);
create index trips_status_idx on trips(status);
create index trips_trip_date_idx on trips(trip_date);

create table live_bus_locations (
  bus_id uuid primary key references buses(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  speed double precision,
  heading double precision,
  accuracy double precision,
  battery_level double precision,
  recorded_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index live_bus_locations_tenant_id_idx on live_bus_locations(tenant_id);
create index live_bus_locations_trip_id_idx on live_bus_locations(trip_id);

-- trip_location_history: TimescaleDB hypertable (when extension available)
-- For now, regular table — will be converted in Phase 2
create table trip_location_history (
  id bigserial primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  bus_id uuid not null references buses(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  speed double precision,
  heading double precision,
  accuracy double precision,
  battery_level double precision,
  recorded_at timestamptz not null,
  location_source text not null check (location_source in ('driver_web', 'driver_mobile', 'hardware_tracker'))
);
create index trip_location_history_tenant_id_idx on trip_location_history(tenant_id);
create index trip_location_history_trip_id_idx on trip_location_history(trip_id);
create index trip_location_history_recorded_at_idx on trip_location_history(recorded_at);

-- Convert to hypertable when TimescaleDB is available:
-- select create_hypertable('trip_location_history', 'recorded_at', chunk_time_interval => interval '1 day');
-- Add retention policy:
-- add_retention_policy('trip_location_history', interval '30 days');

-- ─── Badges & Scan Events ─────────────────────────────────────────────────

create table student_badges (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  -- SHA-256 hash of the QR token. Plaintext never stored.
  token_hash text not null unique,
  status text not null default 'issued' check (status in ('issued', 'active', 'revoked', 'replaced')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index student_badges_student_id_idx on student_badges(student_id);
create index student_badges_token_hash_idx on student_badges(token_hash);

create table student_scan_events (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references trips(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  badge_id uuid references student_badges(id) on delete set null,
  driver_id uuid not null references drivers(id) on delete restrict,
  event_type text not null check (event_type in ('pickup', 'boarding', 'dropoff')),
  is_manual boolean not null default false,
  latitude double precision,
  longitude double precision,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index student_scan_events_trip_id_idx on student_scan_events(trip_id);
create index student_scan_events_student_id_idx on student_scan_events(student_id);

-- ─── Alerts & Notifications ───────────────────────────────────────────────

create table trip_alerts (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references trips(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  alert_type text not null check (alert_type in (
    'gps_stale', 'gps_lost', 'trip_not_started', 'bus_breakdown',
    'road_blocked', 'route_delayed', 'manual_scan_override',
    'notification_failed', 'student_issue', 'driver_reported_issue'
  )),
  severity text not null check (severity in ('urgent', 'warning', 'info')),
  message text not null,
  status text not null default 'active' check (status in ('active', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index trip_alerts_tenant_id_idx on trip_alerts(tenant_id);
create index trip_alerts_trip_id_idx on trip_alerts(trip_id);
create index trip_alerts_status_idx on trip_alerts(status);

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  title text not null,
  message text not null,
  type text not null,
  status text not null default 'unread' check (status in ('unread', 'read')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_profile_id_idx on notifications(profile_id);
create index notifications_tenant_id_idx on notifications(tenant_id);
create index notifications_status_idx on notifications(status);

-- ─── Audit Logs ───────────────────────────────────────────────────────────

create table audit_logs (
  id bigserial primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  actor_profile_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_id_idx on audit_logs(tenant_id);
create index audit_logs_entity_type_idx on audit_logs(entity_type);
create index audit_logs_created_at_idx on audit_logs(created_at desc);

-- ─── Imports ──────────────────────────────────────────────────────────────

create table imports (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  import_type text not null check (import_type in (
    'students', 'guardians', 'student_guardians', 'buses', 'drivers',
    'routes', 'route_stops', 'student_route_assignments'
  )),
  file_name text not null,
  total_rows integer not null default 0,
  successful_rows integer not null default 0,
  failed_rows integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'validating', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  created_by uuid not null references profiles(id) on delete restrict
);
create index imports_tenant_id_idx on imports(tenant_id);

-- ─── Consent & Terms (Alberta FOIP/PIPA) ─────────────────────────────────

create table consents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  consent_type text not null check (consent_type in (
    'student_data_collection', 'pickup_dropoff_tracking', 'badge_issuance', 'notifications'
  )),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  terms_version_id uuid not null,
  ip_address inet,
  unique(profile_id, student_id, consent_type) where revoked_at is null
);
create index consents_tenant_id_idx on consents(tenant_id);
create index consents_profile_id_idx on consents(profile_id);
create index consents_student_id_idx on consents(student_id);

create table terms_versions (
  id uuid primary key default uuid_generate_v4(),
  version text not null,
  type text not null check (type in (
    'privacy_policy', 'terms_of_service', 'guardian_consent',
    'driver_terms', 'tenant_agreement'
  )),
  effective_date date not null,
  content text not null,
  pdf_url text,
  created_at timestamptz not null default now(),
  unique(type, version)
);

create table terms_acceptances (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  terms_version_id uuid not null references terms_versions(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  ip_address inet,
  unique(profile_id, terms_version_id)
);
create index terms_acceptances_profile_id_idx on terms_acceptances(profile_id);

create table security_incidents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  type text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  description text not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'reported')),
  detected_at timestamptz not null default now(),
  reported_at timestamptz,
  affected_count integer,
  created_at timestamptz not null default now()
);
create index security_incidents_tenant_id_idx on security_incidents(tenant_id);
create index security_incidents_status_idx on security_incidents(status);

-- ─── updated_at trigger function ─────────────────────────────────────────

create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_live_bus_locations
  before update on live_bus_locations
  for each row execute function update_updated_at();
