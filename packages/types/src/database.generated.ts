// This file is generated. Do not edit it by hand.
// Run `pnpm types:generate` against the authoritative hosted Supabase schema.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      allowed_redirect_origins: {
        Row: {
          id: string
          tenant_id: string | null
          origin: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          origin: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          origin?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allowed_redirect_origins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          id: string
          tenant_id: string | null
          actor_profile_id: string | null
          actor_email: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          action: string
          target_type: string | null
          target_id: string | null
          target_label: string | null
          outcome: string
          detail: Json
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          actor_profile_id?: string | null
          actor_email?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          action: string
          target_type?: string | null
          target_id?: string | null
          target_label?: string | null
          outcome?: string
          detail: Json
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          actor_profile_id?: string | null
          actor_email?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          action?: string
          target_type?: string | null
          target_id?: string | null
          target_label?: string | null
          outcome?: string
          detail?: Json
          ip_address?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_import_batches: {
        Row: {
          id: string
          tenant_id: string
          created_by_profile_id: string | null
          record_type: string
          file_name: string | null
          status: string
          total_rows: number
          valid_rows: number
          error_rows: number
          dry_run: boolean
          summary: Json
          created_at: string
          updated_at: string
          committed_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          created_by_profile_id?: string | null
          record_type: string
          file_name?: string | null
          status?: string
          total_rows?: number
          valid_rows?: number
          error_rows?: number
          dry_run?: boolean
          summary: Json
          created_at?: string
          updated_at?: string
          committed_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          created_by_profile_id?: string | null
          record_type?: string
          file_name?: string | null
          status?: string
          total_rows?: number
          valid_rows?: number
          error_rows?: number
          dry_run?: boolean
          summary?: Json
          created_at?: string
          updated_at?: string
          committed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_import_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_batches_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_import_staging: {
        Row: {
          id: string
          batch_id: string
          tenant_id: string
          row_number: number
          record_type: string
          row_data: Json
          validation_status: string
          validation_errors: Json
          dedup_key: string | null
          live_record_id: string | null
          invitation_status: string | null
          invitation_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          tenant_id: string
          row_number: number
          record_type: string
          row_data: Json
          validation_status?: string
          validation_errors: Json
          dedup_key?: string | null
          live_record_id?: string | null
          invitation_status?: string | null
          invitation_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          batch_id?: string
          tenant_id?: string
          row_number?: number
          record_type?: string
          row_data?: Json
          validation_status?: string
          validation_errors?: Json
          dedup_key?: string | null
          live_record_id?: string | null
          invitation_status?: string | null
          invitation_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_import_staging_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "bulk_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_staging_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bus_qr_credentials: {
        Row: {
          id: string
          tenant_id: string
          bus_id: string
          token_hash: string
          status: string
          created_by: string
          revoked_at: string | null
          revoked_by: string | null
          replaced_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          bus_id: string
          token_hash: string
          status?: string
          created_by: string
          revoked_at?: string | null
          revoked_by?: string | null
          replaced_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          bus_id?: string
          token_hash?: string
          status?: string
          created_by?: string
          revoked_at?: string | null
          revoked_by?: string | null
          replaced_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bus_qr_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_qr_credentials_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_qr_credentials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_qr_credentials_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_qr_credentials_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "bus_qr_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      bus_route_assignments: {
        Row: {
          id: string
          tenant_id: string
          bus_id: string
          route_id: string
          trip_type: string
          effective_from: string | null
          effective_to: string | null
          status: string
          created_at: string
          updated_at: string
          route_trip_pattern_id: string
        }
        Insert: {
          id?: string
          tenant_id: string
          bus_id: string
          route_id: string
          trip_type: string
          effective_from?: string | null
          effective_to?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          route_trip_pattern_id: string
        }
        Update: {
          id?: string
          tenant_id?: string
          bus_id?: string
          route_id?: string
          trip_type?: string
          effective_from?: string | null
          effective_to?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          route_trip_pattern_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bus_route_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_route_assignments_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_route_assignments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_route_assignments_route_trip_pattern_id_fkey"
            columns: ["route_trip_pattern_id"]
            isOneToOne: false
            referencedRelation: "route_trip_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      bus_run_dispatches: {
        Row: {
          id: string
          tenant_id: string
          bus_id: string
          bus_route_assignment_id: string
          route_id: string
          route_trip_pattern_id: string
          service_date: string
          status: string
          prepared_by: string
          claimed_by_driver_id: string | null
          driver_trip_id: string | null
          prepared_at: string
          claimed_at: string | null
          completed_at: string | null
          cancelled_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          bus_id: string
          bus_route_assignment_id: string
          route_id: string
          route_trip_pattern_id: string
          service_date?: string
          status?: string
          prepared_by: string
          claimed_by_driver_id?: string | null
          driver_trip_id?: string | null
          prepared_at?: string
          claimed_at?: string | null
          completed_at?: string | null
          cancelled_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          bus_id?: string
          bus_route_assignment_id?: string
          route_id?: string
          route_trip_pattern_id?: string
          service_date?: string
          status?: string
          prepared_by?: string
          claimed_by_driver_id?: string | null
          driver_trip_id?: string | null
          prepared_at?: string
          claimed_at?: string | null
          completed_at?: string | null
          cancelled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bus_run_dispatches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_run_dispatches_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_run_dispatches_bus_route_assignment_id_fkey"
            columns: ["bus_route_assignment_id"]
            isOneToOne: false
            referencedRelation: "bus_route_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_run_dispatches_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_run_dispatches_route_trip_pattern_id_fkey"
            columns: ["route_trip_pattern_id"]
            isOneToOne: false
            referencedRelation: "route_trip_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_run_dispatches_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_run_dispatches_claimed_by_driver_id_fkey"
            columns: ["claimed_by_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_run_dispatches_driver_trip_id_fkey"
            columns: ["driver_trip_id"]
            isOneToOne: false
            referencedRelation: "driver_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      bus_tracking_sessions: {
        Row: {
          id: string
          tenant_id: string
          driver_trip_id: string
          driver_id: string
          bus_id: string
          bus_qr_credential_id: string
          session_token_hash: string
          status: string
          started_at: string
          expires_at: string
          last_seen_at: string | null
          ended_at: string | null
          device_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          driver_trip_id: string
          driver_id: string
          bus_id: string
          bus_qr_credential_id: string
          session_token_hash: string
          status?: string
          started_at?: string
          expires_at?: string
          last_seen_at?: string | null
          ended_at?: string | null
          device_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          driver_trip_id?: string
          driver_id?: string
          bus_id?: string
          bus_qr_credential_id?: string
          session_token_hash?: string
          status?: string
          started_at?: string
          expires_at?: string
          last_seen_at?: string | null
          ended_at?: string | null
          device_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bus_tracking_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_tracking_sessions_driver_trip_id_fkey"
            columns: ["driver_trip_id"]
            isOneToOne: false
            referencedRelation: "driver_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_tracking_sessions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_tracking_sessions_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_tracking_sessions_bus_qr_credential_id_fkey"
            columns: ["bus_qr_credential_id"]
            isOneToOne: false
            referencedRelation: "bus_qr_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bus_tracking_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "driver_tracking_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      buses: {
        Row: {
          id: string
          tenant_id: string
          school_id: string | null
          bus_number: string
          license_plate: string | null
          capacity: number | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          school_id?: string | null
          bus_number: string
          license_plate?: string | null
          capacity?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          school_id?: string | null
          bus_number?: string
          license_plate?: string | null
          capacity?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      compromised_password_hashes: {
        Row: {
          sha256: string
          added_at: string
        }
        Insert: {
          sha256: string
          added_at?: string
        }
        Update: {
          sha256?: string
          added_at?: string
        }
        Relationships: []
      }
      driver_route_assignments: {
        Row: {
          id: string
          tenant_id: string
          driver_id: string
          bus_id: string
          route_id: string
          trip_type: string | null
          status: string
          effective_from: string | null
          effective_to: string | null
          created_at: string
          updated_at: string
          bus_route_assignment_id: string | null
          route_trip_pattern_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          driver_id: string
          bus_id: string
          route_id: string
          trip_type?: string | null
          status?: string
          effective_from?: string | null
          effective_to?: string | null
          created_at?: string
          updated_at?: string
          bus_route_assignment_id?: string | null
          route_trip_pattern_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          driver_id?: string
          bus_id?: string
          route_id?: string
          trip_type?: string | null
          status?: string
          effective_from?: string | null
          effective_to?: string | null
          created_at?: string
          updated_at?: string
          bus_route_assignment_id?: string | null
          route_trip_pattern_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_route_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_route_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_route_assignments_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_route_assignments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_route_assignments_bus_route_assignment_id_fkey"
            columns: ["bus_route_assignment_id"]
            isOneToOne: false
            referencedRelation: "bus_route_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_route_assignments_route_trip_pattern_id_fkey"
            columns: ["route_trip_pattern_id"]
            isOneToOne: false
            referencedRelation: "route_trip_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_tracking_devices: {
        Row: {
          id: string
          tenant_id: string
          driver_id: string
          profile_id: string
          installation_id: string
          credential_hash: string
          platform: string
          ownership: string
          device_model: string | null
          app_version: string
          privacy_notice_version: string | null
          privacy_notice_acknowledged_at: string | null
          status: string
          registered_at: string
          last_seen_at: string | null
          revoked_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          driver_id: string
          profile_id: string
          installation_id: string
          credential_hash: string
          platform: string
          ownership: string
          device_model?: string | null
          app_version: string
          privacy_notice_version?: string | null
          privacy_notice_acknowledged_at?: string | null
          status?: string
          registered_at?: string
          last_seen_at?: string | null
          revoked_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          driver_id?: string
          profile_id?: string
          installation_id?: string
          credential_hash?: string
          platform?: string
          ownership?: string
          device_model?: string | null
          app_version?: string
          privacy_notice_version?: string | null
          privacy_notice_acknowledged_at?: string | null
          status?: string
          registered_at?: string
          last_seen_at?: string | null
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_tracking_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_tracking_devices_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_tracking_devices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_trip_current_locations: {
        Row: {
          driver_trip_id: string
          tenant_id: string
          driver_id: string
          bus_id: string
          route_id: string
          latitude: number
          longitude: number
          accuracy_m: number | null
          heading_deg: number | null
          speed_mps: number | null
          source: string
          recorded_at: string
          updated_at: string
          location_geog: string | null
        }
        Insert: {
          driver_trip_id: string
          tenant_id: string
          driver_id: string
          bus_id: string
          route_id: string
          latitude: number
          longitude: number
          accuracy_m?: number | null
          heading_deg?: number | null
          speed_mps?: number | null
          source?: string
          recorded_at?: string
          updated_at?: string
          location_geog?: string | null
        }
        Update: {
          driver_trip_id?: string
          tenant_id?: string
          driver_id?: string
          bus_id?: string
          route_id?: string
          latitude?: number
          longitude?: number
          accuracy_m?: number | null
          heading_deg?: number | null
          speed_mps?: number | null
          source?: string
          recorded_at?: string
          updated_at?: string
          location_geog?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_trip_current_locations_driver_trip_id_fkey"
            columns: ["driver_trip_id"]
            isOneToOne: false
            referencedRelation: "driver_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trip_current_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trip_current_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trip_current_locations_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trip_current_locations_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_trip_location_updates: {
        Row: {
          id: string
          tenant_id: string
          driver_trip_id: string
          driver_id: string
          bus_id: string
          route_id: string
          latitude: number
          longitude: number
          accuracy_m: number | null
          heading_deg: number | null
          speed_mps: number | null
          source: string
          recorded_at: string
          created_at: string
          tracking_event_id: string | null
          tracking_device_id: string | null
          device_sequence: number | null
          battery_percent: number | null
          connectivity: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          driver_trip_id: string
          driver_id: string
          bus_id: string
          route_id: string
          latitude: number
          longitude: number
          accuracy_m?: number | null
          heading_deg?: number | null
          speed_mps?: number | null
          source?: string
          recorded_at?: string
          created_at?: string
          tracking_event_id?: string | null
          tracking_device_id?: string | null
          device_sequence?: number | null
          battery_percent?: number | null
          connectivity?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          driver_trip_id?: string
          driver_id?: string
          bus_id?: string
          route_id?: string
          latitude?: number
          longitude?: number
          accuracy_m?: number | null
          heading_deg?: number | null
          speed_mps?: number | null
          source?: string
          recorded_at?: string
          created_at?: string
          tracking_event_id?: string | null
          tracking_device_id?: string | null
          device_sequence?: number | null
          battery_percent?: number | null
          connectivity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_trip_location_updates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trip_location_updates_driver_trip_id_fkey"
            columns: ["driver_trip_id"]
            isOneToOne: false
            referencedRelation: "driver_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trip_location_updates_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trip_location_updates_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trip_location_updates_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trip_location_updates_tracking_device_id_fkey"
            columns: ["tracking_device_id"]
            isOneToOne: false
            referencedRelation: "driver_tracking_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_trips: {
        Row: {
          id: string
          tenant_id: string
          driver_id: string
          bus_id: string
          route_id: string
          trip_type: string
          status: string
          service_date: string
          started_at: string
          ended_at: string | null
          created_at: string
          updated_at: string
          route_trip_pattern_id: string
          trip_name_snapshot: string
          driver_route_assignment_id: string | null
          route_shape_id: string | null
          bus_number_snapshot: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          driver_id: string
          bus_id: string
          route_id: string
          trip_type: string
          status?: string
          service_date?: string
          started_at?: string
          ended_at?: string | null
          created_at?: string
          updated_at?: string
          route_trip_pattern_id: string
          trip_name_snapshot: string
          driver_route_assignment_id?: string | null
          route_shape_id?: string | null
          bus_number_snapshot?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          driver_id?: string
          bus_id?: string
          route_id?: string
          trip_type?: string
          status?: string
          service_date?: string
          started_at?: string
          ended_at?: string | null
          created_at?: string
          updated_at?: string
          route_trip_pattern_id?: string
          trip_name_snapshot?: string
          driver_route_assignment_id?: string | null
          route_shape_id?: string | null
          bus_number_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_trips_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trips_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trips_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trips_route_trip_pattern_id_fkey"
            columns: ["route_trip_pattern_id"]
            isOneToOne: false
            referencedRelation: "route_trip_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trips_driver_route_assignment_id_fkey"
            columns: ["driver_route_assignment_id"]
            isOneToOne: false
            referencedRelation: "driver_route_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trips_route_shape_id_fkey"
            columns: ["route_shape_id"]
            isOneToOne: false
            referencedRelation: "route_shapes"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          id: string
          tenant_id: string
          profile_id: string
          employee_number: string | null
          phone: string | null
          status: string
          created_at: string
          updated_at: string
          license_number: string | null
          license_issue_date: string | null
          license_expiry_date: string | null
          license_class: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          province: string | null
          postal_code: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          profile_id: string
          employee_number?: string | null
          phone?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          license_number?: string | null
          license_issue_date?: string | null
          license_expiry_date?: string | null
          license_class?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          province?: string | null
          postal_code?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          profile_id?: string
          employee_number?: string | null
          phone?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          license_number?: string | null
          license_issue_date?: string | null
          license_expiry_date?: string | null
          license_class?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          province?: string | null
          postal_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_notification_delivery_policies: {
        Row: {
          tenant_id: string
          notifications_enabled: boolean
          privacy_review_status: string
          tenant_daily_limit: number
          tenant_per_minute_limit: number
          privacy_approved_at: string | null
          privacy_approved_by: string | null
          updated_at: string
        }
        Insert: {
          tenant_id: string
          notifications_enabled?: boolean
          privacy_review_status?: string
          tenant_daily_limit?: number
          tenant_per_minute_limit?: number
          privacy_approved_at?: string | null
          privacy_approved_by?: string | null
          updated_at?: string
        }
        Update: {
          tenant_id?: string
          notifications_enabled?: boolean
          privacy_review_status?: string
          tenant_daily_limit?: number
          tenant_per_minute_limit?: number
          privacy_approved_at?: string | null
          privacy_approved_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_notification_delivery_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_notification_delivery_policies_privacy_approved_by_fkey"
            columns: ["privacy_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_notification_outbox: {
        Row: {
          id: string
          tenant_id: string
          guardian_id: string
          student_id: string
          student_trip_event_id: string
          notification_type: string
          status: string
          created_at: string
          available_after: string
          delivered_at: string | null
          failed_at: string | null
          failure_reason: string | null
          attempt_count: number
          claimed_at: string | null
          claim_expires_at: string | null
          provider_message_id: string | null
          last_attempted_at: string | null
          cancelled_at: string | null
          failure_category: string | null
          updated_at: string
          dead_lettered_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          guardian_id: string
          student_id: string
          student_trip_event_id: string
          notification_type: string
          status?: string
          created_at?: string
          available_after?: string
          delivered_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          attempt_count?: number
          claimed_at?: string | null
          claim_expires_at?: string | null
          provider_message_id?: string | null
          last_attempted_at?: string | null
          cancelled_at?: string | null
          failure_category?: string | null
          updated_at?: string
          dead_lettered_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          guardian_id?: string
          student_id?: string
          student_trip_event_id?: string
          notification_type?: string
          status?: string
          created_at?: string
          available_after?: string
          delivered_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          attempt_count?: number
          claimed_at?: string | null
          claim_expires_at?: string | null
          provider_message_id?: string | null
          last_attempted_at?: string | null
          cancelled_at?: string | null
          failure_category?: string | null
          updated_at?: string
          dead_lettered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardian_notification_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_notification_outbox_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_notification_outbox_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_notification_outbox_student_trip_event_id_fkey"
            columns: ["student_trip_event_id"]
            isOneToOne: false
            referencedRelation: "student_trip_events"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          id: string
          tenant_id: string
          profile_id: string
          full_name: string
          email: string
          phone: string | null
          status: string
          created_at: string
          updated_at: string
          first_name: string
          last_name: string
        }
        Insert: {
          id?: string
          tenant_id: string
          profile_id: string
          full_name: string
          email: string
          phone?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          first_name: string
          last_name: string
        }
        Update: {
          id?: string
          tenant_id?: string
          profile_id?: string
          full_name?: string
          email?: string
          phone?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          first_name?: string
          last_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_notes: {
        Row: {
          id: string
          tenant_id: string
          target_entity: string
          target_id: string
          note_type: string
          note_text: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          target_entity: string
          target_id: string
          note_type: string
          note_text: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          target_entity?: string
          target_id?: string
          note_type?: string
          note_text?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      password_policy: {
        Row: {
          id: number
          min_length: number
          require_uppercase: boolean
          require_lowercase: boolean
          require_digit: boolean
          require_special: boolean
          max_repeating_char: number
          updated_at: string
        }
        Insert: {
          id?: number
          min_length?: number
          require_uppercase?: boolean
          require_lowercase?: boolean
          require_digit?: boolean
          require_special?: boolean
          max_repeating_char?: number
          updated_at?: string
        }
        Update: {
          id?: number
          min_length?: number
          require_uppercase?: boolean
          require_lowercase?: boolean
          require_digit?: boolean
          require_special?: boolean
          max_repeating_char?: number
          updated_at?: string
        }
        Relationships: []
      }
      pre_trip_confirmations: {
        Row: {
          id: string
          tenant_id: string
          driver_trip_id: string
          driver_id: string
          bus_id: string
          confirmed_at: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          driver_trip_id: string
          driver_id: string
          bus_id: string
          confirmed_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          driver_trip_id?: string
          driver_id?: string
          bus_id?: string
          confirmed_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_trip_confirmations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_trip_confirmations_driver_trip_id_fkey"
            columns: ["driver_trip_id"]
            isOneToOne: false
            referencedRelation: "driver_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_trip_confirmations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_trip_confirmations_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          tenant_id: string | null
          school_id: string | null
          full_name: string
          email: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["profile_status"]
          created_at: string
          updated_at: string
          first_name: string
          last_name: string
        }
        Insert: {
          id: string
          tenant_id?: string | null
          school_id?: string | null
          full_name: string
          email: string
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          created_at?: string
          updated_at?: string
          first_name: string
          last_name: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          school_id?: string | null
          full_name?: string
          email?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          created_at?: string
          updated_at?: string
          first_name?: string
          last_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          id: string
          bucket_key: string
          actor_identifier: string
          action: string
          window_start: string
          count: number
        }
        Insert: {
          id?: string
          bucket_key: string
          actor_identifier: string
          action: string
          window_start?: string
          count?: number
        }
        Update: {
          id?: string
          bucket_key?: string
          actor_identifier?: string
          action?: string
          window_start?: string
          count?: number
        }
        Relationships: []
      }
      retention_deletion_runs: {
        Row: {
          id: string
          policy_key: string
          actor_profile_id: string | null
          dry_run: boolean
          affected_rows: number
          status: string
          started_at: string
          completed_at: string | null
          error_code: string | null
        }
        Insert: {
          id?: string
          policy_key: string
          actor_profile_id?: string | null
          dry_run: boolean
          affected_rows?: number
          status?: string
          started_at?: string
          completed_at?: string | null
          error_code?: string | null
        }
        Update: {
          id?: string
          policy_key?: string
          actor_profile_id?: string | null
          dry_run?: boolean
          affected_rows?: number
          status?: string
          started_at?: string
          completed_at?: string | null
          error_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_deletion_runs_policy_key_fkey"
            columns: ["policy_key"]
            isOneToOne: false
            referencedRelation: "retention_policies"
            referencedColumns: ["policy_key"]
          },
          {
            foreignKeyName: "retention_deletion_runs_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_execution_control: {
        Row: {
          id: number
          destructive_enabled: boolean
          approval_reference: string | null
          approved_at: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          destructive_enabled?: boolean
          approval_reference?: string | null
          approved_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          destructive_enabled?: boolean
          approval_reference?: string | null
          approved_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      retention_policies: {
        Row: {
          policy_key: string
          data_class: string
          retention_days: number
          expiry_action: string
          active: boolean
          description: string
          created_at: string
          updated_at: string
        }
        Insert: {
          policy_key: string
          data_class: string
          retention_days: number
          expiry_action: string
          active?: boolean
          description: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          policy_key?: string
          data_class?: string
          retention_days?: number
          expiry_action?: string
          active?: boolean
          description?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      route_service_days: {
        Row: {
          id: string
          tenant_id: string
          route_id: string
          day_of_week: number
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          route_id: string
          day_of_week: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          route_id?: string
          day_of_week?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_service_days_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_service_days_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_shapes: {
        Row: {
          id: string
          tenant_id: string
          route_id: string
          version: number
          path: string
          distance_meters: number
          status: string
          source: string
          effective_from: string | null
          effective_to: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          route_id: string
          version: number
          path: string
          distance_meters: number
          status?: string
          source?: string
          effective_from?: string | null
          effective_to?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          route_id?: string
          version?: number
          path?: string
          distance_meters?: number
          status?: string
          source?: string
          effective_from?: string | null
          effective_to?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_shapes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_shapes_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_shapes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      route_stops: {
        Row: {
          id: string
          tenant_id: string
          route_id: string
          stop_name: string
          stop_order: number
          planned_arrival_time: string | null
          latitude: number | null
          longitude: number | null
          status: string
          created_at: string
          updated_at: string
          school_id: string | null
          location_geog: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          route_id: string
          stop_name: string
          stop_order: number
          planned_arrival_time?: string | null
          latitude?: number | null
          longitude?: number | null
          status?: string
          created_at?: string
          updated_at?: string
          school_id?: string | null
          location_geog?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          route_id?: string
          stop_name?: string
          stop_order?: number
          planned_arrival_time?: string | null
          latitude?: number | null
          longitude?: number | null
          status?: string
          created_at?: string
          updated_at?: string
          school_id?: string | null
          location_geog?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      route_trip_patterns: {
        Row: {
          id: string
          tenant_id: string
          route_id: string
          direction: string
          display_name: string
          status: string
          schedule_review_required: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          route_id: string
          direction: string
          display_name: string
          status?: string
          schedule_review_required?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          route_id?: string
          direction?: string
          display_name?: string
          status?: string
          schedule_review_required?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_trip_patterns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_trip_patterns_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_trip_stop_schedules: {
        Row: {
          id: string
          tenant_id: string
          route_id: string
          route_trip_pattern_id: string
          route_stop_id: string
          planned_arrival_time: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          route_id: string
          route_trip_pattern_id: string
          route_stop_id: string
          planned_arrival_time?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          route_id?: string
          route_trip_pattern_id?: string
          route_stop_id?: string
          planned_arrival_time?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_trip_stop_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_trip_stop_schedules_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_trip_stop_schedules_route_trip_pattern_id_fkey"
            columns: ["route_trip_pattern_id"]
            isOneToOne: false
            referencedRelation: "route_trip_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_trip_stop_schedules_route_stop_id_fkey"
            columns: ["route_stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          id: string
          tenant_id: string
          school_id: string | null
          route_name: string
          route_code: string
          route_type: string
          status: string
          created_at: string
          updated_at: string
          route_kind: string | null
          map_color: string | null
          definition_status: string
        }
        Insert: {
          id?: string
          tenant_id: string
          school_id?: string | null
          route_name: string
          route_code: string
          route_type: string
          status?: string
          created_at?: string
          updated_at?: string
          route_kind?: string | null
          map_color?: string | null
          definition_status?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          school_id?: string | null
          route_name?: string
          route_code?: string
          route_type?: string
          status?: string
          created_at?: string
          updated_at?: string
          route_kind?: string | null
          map_color?: string | null
          definition_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          id: string
          tenant_id: string
          name: string
          city: string | null
          province: string
          status: string
          created_at: string
          updated_at: string
          latitude: number | null
          longitude: number | null
          location_geog: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          city?: string | null
          province?: string
          status?: string
          created_at?: string
          updated_at?: string
          latitude?: number | null
          longitude?: number | null
          location_geog?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          city?: string | null
          province?: string
          status?: string
          created_at?: string
          updated_at?: string
          latitude?: number | null
          longitude?: number | null
          location_geog?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schools_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sis_integration_configs: {
        Row: {
          id: string
          tenant_id: string
          created_by_profile_id: string | null
          provider: string
          display_name: string
          status: string
          settings_json: Json
          secret_reference: string | null
          last_synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          created_by_profile_id?: string | null
          provider?: string
          display_name: string
          status?: string
          settings_json: Json
          secret_reference?: string | null
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          created_by_profile_id?: string | null
          provider?: string
          display_name?: string
          status?: string
          settings_json?: Json
          secret_reference?: string | null
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sis_integration_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sis_integration_configs_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_bus_assignments: {
        Row: {
          id: string
          tenant_id: string
          student_id: string
          bus_route_assignment_id: string
          pickup_stop_id: string | null
          dropoff_stop_id: string | null
          effective_from: string
          effective_to: string | null
          status: string
          created_at: string
          updated_at: string
          route_trip_pattern_id: string
        }
        Insert: {
          id?: string
          tenant_id: string
          student_id: string
          bus_route_assignment_id: string
          pickup_stop_id?: string | null
          dropoff_stop_id?: string | null
          effective_from?: string
          effective_to?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          route_trip_pattern_id: string
        }
        Update: {
          id?: string
          tenant_id?: string
          student_id?: string
          bus_route_assignment_id?: string
          pickup_stop_id?: string | null
          dropoff_stop_id?: string | null
          effective_from?: string
          effective_to?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          route_trip_pattern_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_bus_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_bus_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_bus_assignments_bus_route_assignment_id_fkey"
            columns: ["bus_route_assignment_id"]
            isOneToOne: false
            referencedRelation: "bus_route_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_bus_assignments_pickup_stop_id_fkey"
            columns: ["pickup_stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_bus_assignments_dropoff_stop_id_fkey"
            columns: ["dropoff_stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_bus_assignments_route_trip_pattern_id_fkey"
            columns: ["route_trip_pattern_id"]
            isOneToOne: false
            referencedRelation: "route_trip_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          id: string
          tenant_id: string
          student_id: string
          guardian_id: string
          relationship: string
          can_receive_notifications: boolean
          status: string
          created_at: string
          updated_at: string
          admin_note: string | null
          status_comment: string | null
          access_expires_at: string | null
          revoked_at: string | null
          notify_pickup: boolean
          notify_dropoff: boolean
          notification_preferences_set_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          student_id: string
          guardian_id: string
          relationship?: string
          can_receive_notifications?: boolean
          status?: string
          created_at?: string
          updated_at?: string
          admin_note?: string | null
          status_comment?: string | null
          access_expires_at?: string | null
          revoked_at?: string | null
          notify_pickup?: boolean
          notify_dropoff?: boolean
          notification_preferences_set_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          student_id?: string
          guardian_id?: string
          relationship?: string
          can_receive_notifications?: boolean
          status?: string
          created_at?: string
          updated_at?: string
          admin_note?: string | null
          status_comment?: string | null
          access_expires_at?: string | null
          revoked_at?: string | null
          notify_pickup?: boolean
          notify_dropoff?: boolean
          notification_preferences_set_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
        ]
      }
      student_qr_credentials: {
        Row: {
          id: string
          tenant_id: string
          student_id: string
          token_hash: string
          status: string
          created_at: string
          created_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          replaced_by: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          student_id: string
          token_hash: string
          status?: string
          created_at?: string
          created_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          replaced_by?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          student_id?: string
          token_hash?: string
          status?: string
          created_at?: string
          created_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          replaced_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_qr_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_qr_credentials_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_qr_credentials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_qr_credentials_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_qr_credentials_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "student_qr_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      student_route_assignments: {
        Row: {
          id: string
          tenant_id: string
          student_id: string
          route_id: string
          pickup_stop_id: string | null
          dropoff_stop_id: string | null
          effective_from: string
          effective_to: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          student_id: string
          route_id: string
          pickup_stop_id?: string | null
          dropoff_stop_id?: string | null
          effective_from?: string
          effective_to?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          student_id?: string
          route_id?: string
          pickup_stop_id?: string | null
          dropoff_stop_id?: string | null
          effective_from?: string
          effective_to?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_route_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_route_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_route_assignments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_route_assignments_pickup_stop_id_fkey"
            columns: ["pickup_stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_route_assignments_dropoff_stop_id_fkey"
            columns: ["dropoff_stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      student_trip_events: {
        Row: {
          id: string
          tenant_id: string
          driver_trip_id: string
          student_id: string
          event_type: string
          event_time: string
          created_by: string
          created_at: string
          route_stop_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          driver_trip_id: string
          student_id: string
          event_type: string
          event_time?: string
          created_by: string
          created_at?: string
          route_stop_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          driver_trip_id?: string
          student_id?: string
          event_type?: string
          event_time?: string
          created_by?: string
          created_at?: string
          route_stop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_trip_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_trip_events_driver_trip_id_fkey"
            columns: ["driver_trip_id"]
            isOneToOne: false
            referencedRelation: "driver_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_trip_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_trip_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_trip_events_route_stop_id_fkey"
            columns: ["route_stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          id: string
          tenant_id: string
          school_id: string | null
          first_name: string
          last_name: string
          preferred_name: string | null
          grade: string | null
          school_student_number: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          school_id?: string | null
          first_name: string
          last_name: string
          preferred_name?: string | null
          grade?: string | null
          school_student_number?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          school_id?: string | null
          first_name?: string
          last_name?: string
          preferred_name?: string | null
          grade?: string | null
          school_student_number?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_lifecycle_snapshot_entries: {
        Row: {
          snapshot_id: string
          entity_type: string
          entity_id: string
          previous_status: string
        }
        Insert: {
          snapshot_id: string
          entity_type: string
          entity_id: string
          previous_status: string
        }
        Update: {
          snapshot_id?: string
          entity_type?: string
          entity_id?: string
          previous_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_lifecycle_snapshot_entries_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "tenant_lifecycle_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_lifecycle_snapshots: {
        Row: {
          id: string
          tenant_id: string
          previous_tenant_status: string
          suspended_status: string
          created_by_profile_id: string | null
          created_at: string
          restored_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          previous_tenant_status: string
          suspended_status: string
          created_by_profile_id?: string | null
          created_at?: string
          restored_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          previous_tenant_status?: string
          suspended_status?: string
          created_by_profile_id?: string | null
          created_at?: string
          restored_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_lifecycle_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_lifecycle_snapshots_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_onboarding_invitations: {
        Row: {
          id: string
          tenant_id: string
          email: string
          full_name: string
          role: Database["public"]["Enums"]["user_role"]
          status: string
          invited_profile_id: string | null
          invited_by_profile_id: string | null
          last_sent_at: string | null
          cancelled_at: string | null
          created_at: string
          updated_at: string
          expires_at: string
          revoked_at: string | null
          delivery_status: string
          delivered_at: string | null
          bulk_batch_id: string | null
          source_row_number: number | null
          delivery_attempts: number
          last_delivery_error: string | null
          delivery_claimed_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          email: string
          full_name: string
          role: Database["public"]["Enums"]["user_role"]
          status?: string
          invited_profile_id?: string | null
          invited_by_profile_id?: string | null
          last_sent_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
          expires_at?: string
          revoked_at?: string | null
          delivery_status?: string
          delivered_at?: string | null
          bulk_batch_id?: string | null
          source_row_number?: number | null
          delivery_attempts?: number
          last_delivery_error?: string | null
          delivery_claimed_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          email?: string
          full_name?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          invited_profile_id?: string | null
          invited_by_profile_id?: string | null
          last_sent_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
          expires_at?: string
          revoked_at?: string | null
          delivery_status?: string
          delivered_at?: string | null
          bulk_batch_id?: string | null
          source_row_number?: number | null
          delivery_attempts?: number
          last_delivery_error?: string | null
          delivery_claimed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_invitations_invited_profile_id_fkey"
            columns: ["invited_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_invitations_bulk_batch_id_fkey"
            columns: ["bulk_batch_id"]
            isOneToOne: false
            referencedRelation: "bulk_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          id: string
          name: string
          type: string
          status: string
          created_at: string
          updated_at: string
          timezone: string
        }
        Insert: {
          id?: string
          name: string
          type?: string
          status?: string
          created_at?: string
          updated_at?: string
          timezone?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          status?: string
          created_at?: string
          updated_at?: string
          timezone?: string
        }
        Relationships: []
      }
      trip_exceptions: {
        Row: {
          id: string
          tenant_id: string
          driver_trip_id: string
          driver_id: string
          exception_type: string
          exception_detail: string | null
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          driver_trip_id: string
          driver_id: string
          exception_type: string
          exception_detail?: string | null
          occurred_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          driver_trip_id?: string
          driver_id?: string
          exception_type?: string
          exception_detail?: string | null
          occurred_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_exceptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_exceptions_driver_trip_id_fkey"
            columns: ["driver_trip_id"]
            isOneToOne: false
            referencedRelation: "driver_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_exceptions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_operational_statuses: {
        Row: {
          id: string
          tenant_id: string
          driver_trip_id: string
          operational_status: string
          reason_code: string | null
          set_by: string
          set_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          driver_trip_id: string
          operational_status?: string
          reason_code?: string | null
          set_by: string
          set_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          driver_trip_id?: string
          operational_status?: string
          reason_code?: string | null
          set_by?: string
          set_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_operational_statuses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_statuses_driver_trip_id_fkey"
            columns: ["driver_trip_id"]
            isOneToOne: false
            referencedRelation: "driver_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_statuses_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          id: string
          user_id: string
          tenant_id: string | null
          device_label: string | null
          user_agent: string | null
          ip_address: string | null
          created_at: string
          last_active_at: string
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          id?: string
          user_id: string
          tenant_id?: string | null
          device_label?: string | null
          user_agent?: string | null
          ip_address?: string | null
          created_at?: string
          last_active_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          tenant_id?: string | null
          device_label?: string | null
          user_agent?: string | null
          ip_address?: string | null
          created_at?: string
          last_active_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_notification_retention: { Args: { p_dry_run?: boolean }; Returns: { email_deleted: number; inbox_deleted: number; push_deleted: number; devices_staled: number }[] }
      archive_user_notifications: {
        Args: { p_ids: string[] }
        Returns: number
      }
      cancel_push_notification_delivery: {
        Args: { p_outbox_id: string; p_reason: string }
        Returns: boolean
      }
      claim_push_notification_deliveries: {
        Args: { p_worker_id: string; p_limit?: number; p_lease_seconds?: number }
        Returns: {
          outbox_id: string; tenant_id: string; notification_id: string; device_id: string
          fcm_token: string; event_type: string; category: string; severity: string
          preview_mode: string; android_channel: string; collapse_key: string
          title: string; body: string; attempt_count: number
        }[]
      }
      cleanup_stale_android_push_devices: { Args: Record<PropertyKey, never>; Returns: number }
      complete_push_notification_delivery: {
        Args: { p_outbox_id: string; p_worker_id: string; p_provider_message_id: string }
        Returns: boolean
      }
      fail_push_notification_delivery: {
        Args: { p_outbox_id: string; p_worker_id: string; p_failure_category: string; p_failure_code: string; p_invalidate_device?: boolean }
        Returns: boolean
      }
      get_guardian_notification_preferences_v2: {
        Args: Record<PropertyKey, never>
        Returns: { student_id: string; student_name: string; email_enabled: boolean; email_pickup: boolean; email_dropoff: boolean; push_pickup_dropoff: boolean; push_trip_status: boolean; push_service_changes: boolean; preferences_set_at: string | null; access_expires_at: string | null }[]
      }
      get_notification_delivery_health_v2: { Args: Record<PropertyKey, never>; Returns: Json }
      get_notification_preferences: { Args: Record<PropertyKey, never>; Returns: Json }
      get_user_notification_unread_count: { Args: Record<PropertyKey, never>; Returns: number }
      get_user_notifications: {
        Args: { p_limit?: number; p_before_created_at?: string; p_before_id?: string; p_unread_only?: boolean; p_category?: string }
        Returns: { id: string; event_type: string; category: string; severity: string; title: string; body: string; occurred_at: string; created_at: string; read_at: string | null; archived_at: string | null; destination_path: string }[]
      }
      list_own_push_devices: {
        Args: Record<PropertyKey, never>
        Returns: { id: string; installation_id: string; device_model: string | null; app_version: string | null; permission_state: string; status: string; last_registered_at: string; last_seen_at: string }[]
      }
      mark_all_user_notifications_read: { Args: Record<PropertyKey, never>; Returns: number }
      mark_user_notifications_read: { Args: { p_ids: string[]; p_read?: boolean }; Returns: number }
      register_android_push_device: {
        Args: { p_installation_id: string; p_fcm_token: string; p_device_model: string; p_app_version: string; p_permission_state: string }
        Returns: string
      }
      record_notification_delivery_incident: { Args: { p_tenant_id: string | null; p_incident_code: string }; Returns: number }
      retry_push_notification_delivery: {
        Args: { p_outbox_id: string; p_worker_id: string; p_failure_category: string; p_failure_code: string; p_available_after: string; p_retry_after_seconds?: number }
        Returns: boolean
      }
      resolve_push_notification_delivery: {
        Args: { p_outbox_id: string; p_worker_id: string }
        Returns: { outbox_id: string; tenant_id: string; notification_id: string; device_id: string; fcm_token: string; event_type: string; category: string; severity: string; preview_mode: string; android_channel: string; collapse_key: string; title: string; body: string; attempt_count: number }[]
      }
      revoke_own_push_device: { Args: { p_device_id: string }; Returns: boolean }
      set_guardian_notification_preferences_v2: {
        Args: { p_student_id: string; p_email_enabled: boolean; p_email_pickup: boolean; p_email_dropoff: boolean; p_push_pickup_dropoff: boolean; p_push_trip_status: boolean; p_push_service_changes: boolean }
        Returns: undefined
      }
      set_notification_preferences: {
        Args: { p_push_enabled: boolean; p_quiet_hours_enabled: boolean; p_quiet_hours_start: string; p_quiet_hours_end: string; p_timezone_override: string | null; p_urgent_bypass_quiet_hours: boolean; p_preview_mode: string; p_categories: Json }
        Returns: Json
      }
      admin_create_route_shape_version: {
        Args: {
          p_geojson: Json
          p_route_id: string
          p_source?: string | null
          p_status?: string | null
        }
        Returns: unknown
      }
      admin_create_student_onboarding: {
        Args: {
          p_payload: Json
        }
        Returns: unknown
      }
      admin_deactivate_student_guardian: {
        Args: {
          p_link_id: string
        }
        Returns: unknown
      }
      admin_end_bus_route_assignment: {
        Args: {
          p_bus_route_assignment_id: string
        }
        Returns: unknown
      }
      admin_end_bus_route_service: {
        Args: {
          p_assignment_ids: Array<string>
        }
        Returns: unknown
      }
      admin_finalize_member_invitation: {
        Args: {
          p_auth_user_id: string
          p_driver_details?: Json | null
          p_email: string
          p_first_name: string
          p_last_name: string
          p_phone: string
          p_role: string
          p_student_links?: Json | null
        }
        Returns: unknown
      }
      admin_link_student_guardian: {
        Args: {
          p_can_receive_notifications?: boolean | null
          p_guardian_id: string
          p_relationship?: string | null
          p_student_id: string
        }
        Returns: unknown
      }
      admin_page_size: {
        Args: {
          p_page_size: number
        }
        Returns: unknown
      }
      admin_process_student_csv_import: {
        Args: {
          p_acknowledge_warnings?: boolean | null
          p_commit?: boolean | null
          p_rows: Json
        }
        Returns: unknown
      }
      admin_publish_route_shape_version: {
        Args: {
          p_route_shape_id: string
        }
        Returns: unknown
      }
      admin_renew_bus_route_assignment: {
        Args: {
          p_bus_route_assignment_id: string
          p_effective_from?: string | null
          p_effective_to?: string | null
        }
        Returns: unknown
      }
      admin_replace_bus_trip_driver: {
        Args: {
          p_bus_route_assignment_id: string
          p_driver_id: string
          p_effective_from?: string | null
          p_effective_to?: string | null
        }
        Returns: unknown
      }
      admin_save_route_definition: {
        Args: {
          p_route: Json
          p_stops: Json
          p_trip_patterns: Json
        }
        Returns: unknown
      }
      admin_set_bus_route_service: {
        Args: {
          p_bus_id: string
          p_direction_scope?: string | null
          p_effective_from?: string | null
          p_effective_to?: string | null
          p_existing_assignment_ids?: Array<string> | null
          p_route_id: string
        }
        Returns: unknown
      }
      admin_set_driver_bus_assignment: {
        Args: {
          p_driver_id: string
          p_bus_route_assignment_id: string
          p_effective_from: string
          p_effective_to?: string | null
          p_existing_assignment_id?: string | null
        }
        Returns: Json
      }
      admin_set_guardian_access_expiry: {
        Args: {
          p_access_expires_at?: string | null
          p_student_guardian_id: string
        }
        Returns: unknown
      }
      admin_set_student_bus_service: {
        Args: {
          p_bus_id: string
          p_direction_scope?: string | null
          p_effective_from?: string | null
          p_effective_to?: string | null
          p_existing_assignment_ids?: Array<string> | null
          p_forward_dropoff_stop_id?: string | null
          p_forward_pickup_stop_id?: string | null
          p_reverse_dropoff_stop_id?: string | null
          p_reverse_pickup_stop_id?: string | null
          p_route_id: string
          p_student_id: string
        }
        Returns: unknown
      }
      admin_set_student_bus_service_status: {
        Args: {
          p_assignment_ids: Array<string>
          p_end_service?: boolean | null
          p_status: string
        }
        Returns: unknown
      }
      admin_set_student_guardian_status: {
        Args: {
          p_admin_note?: string | null
          p_comment?: string | null
          p_link_id: string
          p_status: string
        }
        Returns: unknown
      }
      admin_update_bus_route_assignment: {
        Args: {
          p_bus_route_assignment_id: string
          p_effective_from: string
          p_effective_to?: string | null
          p_route_id: string
          p_route_trip_pattern_id: string
          p_trip_type: string
        }
        Returns: unknown
      }
      bind_driver_tracking_device: {
        Args: {
          p_device_credential: string
          p_installation_id: string
          p_tracking_token: string
        }
        Returns: unknown
      }
      broadcast_route_tracking_invalidation: {
        Args: {
          p_reason: string
          p_route_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      broadcast_student_guardian_tracking_invalidation: {
        Args: {
          p_reason: string
          p_student_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      bulk_import_commit: {
        Args: {
          p_batch_id: string
          p_confirm: boolean
        }
        Returns: unknown
      }
      bulk_import_generate_invitations: {
        Args: {
          p_batch_id: string
        }
        Returns: unknown
      }
      bulk_import_get_errors: {
        Args: {
          p_batch_id: string
        }
        Returns: unknown
      }
      bulk_import_rollback: {
        Args: {
          p_batch_id: string
        }
        Returns: unknown
      }
      bulk_import_stage_rows: {
        Args: {
          p_dry_run?: boolean | null
          p_file_name?: string | null
          p_record_type: string
          p_rows: Json
        }
        Returns: unknown
      }
      bus_service_entities_in_tenant: {
        Args: {
          p_bus_id: string
          p_route_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      calculate_safe_route_eta: {
        Args: {
          p_latitude: number
          p_longitude: number
          p_recorded_at: string
          p_route_id: string
          p_speed_mps: number
          p_target_stop_id: string
          p_trip_type: string
        }
        Returns: unknown
      }
      can_access_phase6_operational_target: {
        Args: {
          p_target_entity: string
          p_target_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      can_select_linked_student_as_guardian: {
        Args: {
          p_student_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      can_write_driver_profile: {
        Args: {
          p_profile_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      can_write_optional_school: {
        Args: {
          p_school_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      can_write_route_stop: {
        Args: {
          p_route_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      can_write_school: {
        Args: {
          p_school_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      can_write_student_roster: {
        Args: {
          p_school_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      can_write_student_route_assignment: {
        Args: {
          p_dropoff_stop_id: string
          p_pickup_stop_id: string
          p_route_id: string
          p_student_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      can_write_tenant: {
        Args: {
          p_tenant_id: string
        }
        Returns: unknown
      }
      cancel_driver_trip: {
        Args: {
          p_reason?: string | null
          p_trip_id: string
        }
        Returns: unknown
      }
      cancel_guardian_notification_email: {
        Args: {
          p_failure_category: string
          p_failure_reason: string
          p_outbox_id: string
        }
        Returns: unknown
      }
      check_invitation_idempotency: {
        Args: {
          p_email: string
          p_role: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      check_rate_limit: {
        Args: {
          p_action: string
          p_actor_identifier: string
          p_max?: number | null
          p_window_seconds?: number | null
        }
        Returns: unknown
      }
      claim_bulk_invitation_rows: {
        Args: {
          p_batch_id: string
          p_limit?: number | null
        }
        Returns: unknown
      }
      claim_guardian_notification_email_batch: {
        Args: {
          p_batch_size?: number | null
          p_lease_seconds?: number | null
          p_max_attempts?: number | null
          p_provider_limit_per_minute?: number | null
        }
        Returns: unknown
      }
      complete_guardian_notification_email: {
        Args: {
          p_outbox_id: string
          p_provider_message_id?: string | null
        }
        Returns: unknown
      }
      complete_invited_account: {
        Args: {
        }
        Returns: unknown
      }
      confirm_pre_trip: {
        Args: {
          p_trip_id: string
        }
        Returns: unknown
      }
      count_active_tenant_admins: {
        Args: {
          p_tenant_id: string
        }
        Returns: unknown
      }
      create_bus_qr_token: {
        Args: {
        }
        Returns: unknown
      }
      create_bus_tracking_session_token: {
        Args: {
        }
        Returns: unknown
      }
      create_driver_device_credential: {
        Args: {
        }
        Returns: unknown
      }
      create_student_qr_token: {
        Args: {
        }
        Returns: unknown
      }
      current_driver_id: {
        Args: {
        }
        Returns: unknown
      }
      current_guardian_id: {
        Args: {
        }
        Returns: unknown
      }
      current_profile_id: {
        Args: {
        }
        Returns: unknown
      }
      current_route_shape_id_for_route: {
        Args: {
          p_route_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      current_school_id: {
        Args: {
        }
        Returns: unknown
      }
      current_tenant_id: {
        Args: {
        }
        Returns: unknown
      }
      current_user_role: {
        Args: {
        }
        Returns: unknown
      }
      driver_assignment_entities_in_tenant: {
        Args: {
          p_bus_id: string
          p_driver_id: string
          p_route_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      driver_can_read_assigned_route: {
        Args: {
          p_route_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      driver_trip_entities_in_tenant: {
        Args: {
          p_bus_id: string
          p_route_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      end_driver_trip: {
        Args: {
          p_trip_id: string
        }
        Returns: unknown
      }
      enforce_mfa_if_required: {
        Args: {
        }
        Returns: unknown
      }
      enforce_new_password_policy: {
        Args: {
          p_password: string
        }
        Returns: unknown
      }
      enforce_recent_auth_for_sensitive_action: {
        Args: {
        }
        Returns: unknown
      }
      expire_stale_invitations: {
        Args: {
        }
        Returns: unknown
      }
      fail_guardian_notification_email: {
        Args: {
          p_failure_category: string
          p_failure_reason: string
          p_outbox_id: string
        }
        Returns: unknown
      }
      get_admin_active_trip_operational_statuses: {
        Args: {
        }
        Returns: unknown
      }
      get_admin_bus_qr_credential_status: {
        Args: {
          p_bus_id: string
        }
        Returns: unknown
      }
      get_admin_bus_ready_dispatch: {
        Args: {
          p_bus_id: string
        }
        Returns: unknown
      }
      get_admin_bus_services: {
        Args: {
        }
        Returns: unknown
      }
      get_admin_bus_workspace: {
        Args: {
          p_bus_id: string
        }
        Returns: unknown
      }
      get_admin_dashboard_overview: {
        Args: {
        }
        Returns: unknown
      }
      get_admin_guardian_links: {
        Args: {
          p_guardian_id: string
        }
        Returns: unknown
      }
      get_admin_live_fleet_monitoring: {
        Args: {
        }
        Returns: unknown
      }
      get_admin_live_fleet_monitoring_in_viewport: {
        Args: {
          p_east_longitude: number
          p_north_latitude: number
          p_south_latitude: number
          p_west_longitude: number
        }
        Returns: unknown
      }
      get_admin_live_route_overlays: {
        Args: {
        }
        Returns: unknown
      }
      get_admin_live_trip_monitoring: {
        Args: {
        }
        Returns: unknown
      }
      get_admin_live_trip_stop_distance_metres: {
        Args: {
          p_driver_trip_id: string
          p_route_stop_id: string
        }
        Returns: unknown
      }
      get_admin_paginated_list: {
        Args: {
          p_entity: string
          p_page?: number | null
          p_page_size?: number | null
          p_school_id?: string | null
          p_search?: string | null
          p_status?: string | null
        }
        Returns: unknown
      }
      get_admin_route_shape_versions: {
        Args: {
          p_route_id: string
        }
        Returns: unknown
      }
      get_admin_route_stop_options: {
        Args: {
          p_route_id: string
        }
        Returns: unknown
      }
      get_admin_student_bus_assignments_page: {
        Args: {
          p_page?: number | null
          p_page_size?: number | null
          p_search?: string | null
          p_status?: string | null
        }
        Returns: unknown
      }
      get_admin_student_qr_credential_status: {
        Args: {
          p_student_id: string
        }
        Returns: unknown
      }
      get_admin_students_page: {
        Args: {
          p_page?: number | null
          p_page_size?: number | null
          p_school_id?: string | null
          p_search?: string | null
          p_status?: string | null
        }
        Returns: unknown
      }
      get_admin_trip_overview: {
        Args: {
          p_limit?: number | null
        }
        Returns: unknown
      }
      get_bulk_invitation_delivery_summary: {
        Args: {
          p_batch_id: string
        }
        Returns: unknown
      }
      get_bus_qr_start_options: {
        Args: {
          p_qr_token: string
        }
        Returns: unknown
      }
      get_current_driver_trip_assignments: {
        Args: {
        }
        Returns: unknown
      }
      get_current_route_shape: {
        Args: {
          p_route_id: string
        }
        Returns: unknown
      }
      get_driver_active_trip_route_shape: {
        Args: {
        }
        Returns: unknown
      }
      get_driver_active_trip_student_manifest: {
        Args: {
        }
        Returns: unknown
      }
      get_driver_completed_trip_history: {
        Args: {
          p_limit?: number | null
        }
        Returns: unknown
      }
      get_guardian_bus_visibility: {
        Args: {
        }
        Returns: unknown
      }
      get_guardian_bus_visibility_v2: {
        Args: {
        }
        Returns: unknown
      }
      get_guardian_live_route_overlays: {
        Args: {
        }
        Returns: unknown
      }
      get_guardian_live_trip_visibility: {
        Args: {
        }
        Returns: unknown
      }
      get_guardian_notification_preferences: {
        Args: {
        }
        Returns: unknown
      }
      get_guardian_student_live_bus_location_state: {
        Args: {
        }
        Returns: unknown
      }
      get_guardian_student_route_visibility: {
        Args: {
        }
        Returns: unknown
      }
      get_guardian_student_trip_event_visibility: {
        Args: {
        }
        Returns: unknown
      }
      get_platform_first_admin_invitation_status: {
        Args: {
        }
        Returns: unknown
      }
      get_platform_tenant_onboarding_summary: {
        Args: {
        }
        Returns: unknown
      }
      get_platform_tenant_onboarding_summary_secure: {
        Args: {
        }
        Returns: unknown
      }
      get_retention_policies: {
        Args: {
        }
        Returns: unknown
      }
      get_tenant_notification_delivery_summary: {
        Args: {
          p_recent_window_hours?: number | null
        }
        Returns: unknown
      }
      has_recent_authentication: {
        Args: {
        }
        Returns: unknown
      }
      has_verified_mfa: {
        Args: {
        }
        Returns: unknown
      }
      hash_bus_tracking_token: {
        Args: {
          p_token: string
        }
        Returns: unknown
      }
      hash_driver_device_credential: {
        Args: {
          p_token: string
        }
        Returns: unknown
      }
      hash_student_qr_token: {
        Args: {
          p_token: string
        }
        Returns: unknown
      }
      ingest_driver_location_event: {
        Args: {
          p_accuracy_m?: number | null
          p_battery_percent?: number | null
          p_connectivity?: string | null
          p_device_credential: string
          p_event_id: string
          p_heading_deg?: number | null
          p_latitude: number
          p_longitude: number
          p_recorded_at: string
          p_sequence: number
          p_speed_mps?: number | null
          p_tracking_token: string
        }
        Returns: unknown
      }
      is_allowed_redirect_origin: {
        Args: {
          p_origin: string
        }
        Returns: unknown
      }
      is_compromised_password: {
        Args: {
          p_password: string
        }
        Returns: unknown
      }
      is_current_user_session_active: {
        Args: {
        }
        Returns: unknown
      }
      is_platform_super_admin: {
        Args: {
        }
        Returns: unknown
      }
      is_school_or_transportation_admin: {
        Args: {
        }
        Returns: unknown
      }
      is_tenant_admin: {
        Args: {
        }
        Returns: unknown
      }
      is_tenant_delete_admin: {
        Args: {
        }
        Returns: unknown
      }
      is_transportation_write_admin: {
        Args: {
        }
        Returns: unknown
      }
      manage_bus_qr_credential: {
        Args: {
          p_action: string
          p_bus_id: string
        }
        Returns: unknown
      }
      manage_student_qr_credential: {
        Args: {
          p_action: string
          p_student_id: string
        }
        Returns: unknown
      }
      mark_student_dropped_off_for_active_trip: {
        Args: {
          p_student_id: string
        }
        Returns: unknown
      }
      mark_student_picked_up_for_active_trip: {
        Args: {
          p_student_id: string
        }
        Returns: unknown
      }
      pause_driver_trip: {
        Args: {
          p_trip_id: string
        }
        Returns: unknown
      }
      phase5_write_audit_event: {
        Args: {
          p_action: string
          p_actor_profile_id: string
          p_detail: Json
          p_target_id: string
          p_target_label: string
          p_target_type: string
        }
        Returns: unknown
      }
      platform_cancel_first_admin_invitation: {
        Args: {
          p_invitation_id: string
        }
        Returns: unknown
      }
      platform_emergency_admin_recovery: {
        Args: {
          p_profile_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      platform_finalize_tenant_invitation: {
        Args: {
          p_admin_email: string
          p_admin_name: string
          p_auth_user_id: string
          p_city: string
          p_school_name: string
          p_tenant_name: string
          p_tenant_type: string
        }
        Returns: unknown
      }
      platform_find_unprofiled_auth_user: {
        Args: {
          p_email: string
        }
        Returns: unknown
      }
      platform_is_first_admin_invitation: {
        Args: {
          p_invitation_id: string
        }
        Returns: unknown
      }
      platform_set_tenant_lifecycle: {
        Args: {
          p_status: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      prepare_bus_run: {
        Args: {
          p_bus_route_assignment_id: string
        }
        Returns: unknown
      }
      recent_auth_window_seconds: {
        Args: {
        }
        Returns: unknown
      }
      reconcile_bulk_invitation_delivery: {
        Args: {
          p_error?: string | null
          p_profile_id?: string | null
          p_queue_invitation_id: string
        }
        Returns: unknown
      }
      record_own_auth_event: {
        Args: {
          p_action: string
          p_detail?: Json | null
          p_outcome?: string | null
        }
        Returns: unknown
      }
      record_student_record_access: {
        Args: {
          p_student_id: string
        }
        Returns: unknown
      }
      record_student_trip_event_for_active_trip: {
        Args: {
          p_event_type: string
          p_student_id: string
        }
        Returns: unknown
      }
      record_trip_exception: {
        Args: {
          p_exception_detail?: string | null
          p_exception_type: string
          p_trip_id: string
        }
        Returns: unknown
      }
      register_android_tracking_device: {
        Args: {
          p_app_version: string
          p_device_model: string
          p_installation_id: string
          p_ownership?: string | null
        }
        Returns: unknown
      }
      register_android_byod_tracking_device: {
        Args: {
          p_app_version: string
          p_device_model: string
          p_installation_id: string
          p_notice_version: string
        }
        Returns: unknown
      }
      revoke_driver_tracking_devices: {
        Args: {
          p_profile_id: string
        }
        Returns: number
      }
      register_current_user_session: {
        Args: {
          p_device_label?: string | null
          p_user_agent?: string | null
        }
        Returns: unknown
      }
      replace_bus: {
        Args: {
          p_assignment_id: string
          p_replacement_bus_id: string
        }
        Returns: unknown
      }
      requeue_guardian_notification_dead_letter: {
        Args: {
          p_outbox_id: string
        }
        Returns: unknown
      }
      require_route_shape_admin: {
        Args: {
        }
        Returns: unknown
      }
      requires_mfa_for_admin_action: {
        Args: {
        }
        Returns: unknown
      }
      resolve_guardian_notification_email_payload: {
        Args: {
          p_outbox_id: string
        }
        Returns: unknown
      }
      resolve_student_qr_for_active_trip: {
        Args: {
          p_qr_token: string
        }
        Returns: unknown
      }
      resume_driver_trip: {
        Args: {
          p_trip_id: string
        }
        Returns: unknown
      }
      retry_guardian_notification_email: {
        Args: {
          p_failure_category: string
          p_failure_reason: string
          p_max_attempts?: number | null
          p_outbox_id: string
          p_retry_after_seconds: number
        }
        Returns: unknown
      }
      revoke_all_user_sessions: {
        Args: {
          p_user_id: string
        }
        Returns: unknown
      }
      revoke_guardian_access: {
        Args: {
          p_reason?: string | null
          p_student_guardian_id: string
        }
        Returns: unknown
      }
      revoke_invitation: {
        Args: {
          p_invitation_id: string
        }
        Returns: unknown
      }
      route_definition_is_ready: {
        Args: {
          p_route_id: string
        }
        Returns: unknown
      }
      run_all_retention_deletions: {
        Args: {
          p_dry_run?: boolean | null
        }
        Returns: unknown
      }
      run_retention_deletion: {
        Args: {
          p_dry_run?: boolean | null
          p_key: string
        }
        Returns: unknown
      }
      safebus_distance_meters: {
        Args: {
          p_lat1: number
          p_lat2: number
          p_lng1: number
          p_lng2: number
        }
        Returns: unknown
      }
      sanitize_audit_detail: {
        Args: {
          p_value: Json
        }
        Returns: unknown
      }
      search_admin_buses: {
        Args: {
          p_limit?: number | null
          p_search: string
        }
        Returns: unknown
      }
      search_admin_guardians: {
        Args: {
          p_limit?: number | null
          p_search: string
        }
        Returns: unknown
      }
      search_admin_routes: {
        Args: {
          p_limit?: number | null
          p_search: string
        }
        Returns: unknown
      }
      search_admin_students: {
        Args: {
          p_limit?: number | null
          p_search: string
        }
        Returns: unknown
      }
      send_guardian_tracking_invalidation: {
        Args: {
          p_profile_id: string
          p_reason: string
        }
        Returns: unknown
      }
      send_tracking_invalidation: {
        Args: {
          p_reason: string
          p_topic: string
        }
        Returns: unknown
      }
      server_get_member_invitation_state: {
        Args: {
          p_email: string
        }
        Returns: unknown
      }
      set_guardian_notification_preferences: {
        Args: {
          p_email_enabled: boolean
          p_notify_dropoff: boolean
          p_notify_pickup: boolean
          p_student_id: string
        }
        Returns: unknown
      }
      set_trip_operational_status: {
        Args: {
          p_driver_trip_id: string
          p_operational_status: string
          p_reason_code?: string | null
        }
        Returns: unknown
      }
      start_bus_tracking_from_qr: {
        Args: {
          p_bus_route_assignment_id: string
          p_qr_token: string
        }
        Returns: unknown
      }
      start_driver_trip_from_assignment: {
        Args: {
          p_assignment_id: string
        }
        Returns: unknown
      }
      start_driver_trip_from_bus: {
        Args: {
          p_bus_id: string
        }
        Returns: unknown
      }
      student_bus_assignment_entities_in_tenant: {
        Args: {
          p_dropoff_stop_id: string
          p_pickup_stop_id: string
          p_service_id: string
          p_student_id: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      substitute_driver: {
        Args: {
          p_assignment_id: string
          p_substitute_driver_id: string
        }
        Returns: unknown
      }
      tenant_add_sub_administrator: {
        Args: {
          p_auth_user_id: string
          p_email: string
          p_full_name: string
          p_role: string
          p_school_id?: string | null
        }
        Returns: unknown
      }
      tenant_change_admin_role: {
        Args: {
          p_new_role: string
          p_profile_id: string
          p_school_id?: string | null
        }
        Returns: unknown
      }
      tenant_depart_administrator: {
        Args: {
          p_profile_id: string
        }
        Returns: unknown
      }
      tenant_invite_administrator: {
        Args: {
          p_auth_user_id: string
          p_email: string
          p_full_name: string
          p_tenant_id: string
        }
        Returns: unknown
      }
      tenant_restore_administrator: {
        Args: {
          p_profile_id: string
        }
        Returns: unknown
      }
      tenant_search_audit_events: {
        Args: {
          p_action?: string | null
          p_actor_profile_id?: string | null
          p_from_date?: string | null
          p_limit?: number | null
          p_offset?: number | null
          p_target_type?: string | null
          p_to_date?: string | null
        }
        Returns: unknown
      }
      tenant_suspend_administrator: {
        Args: {
          p_profile_id: string
        }
        Returns: unknown
      }
      tenant_transfer_administrator: {
        Args: {
          p_profile_id: string
          p_tenant_id?: string | null
        }
        Returns: unknown
      }
      update_bus_tracking_location: {
        Args: {
          p_accuracy_m?: number | null
          p_heading_deg?: number | null
          p_latitude: number
          p_longitude: number
          p_speed_mps?: number | null
          p_tracking_token: string
        }
        Returns: unknown
      }
      update_driver_trip_location: {
        Args: {
          p_accuracy_m?: number | null
          p_driver_trip_id: string
          p_heading_deg?: number | null
          p_latitude: number
          p_longitude: number
          p_source?: string | null
          p_speed_mps?: number | null
        }
        Returns: unknown
      }
      update_invitation_delivery_status: {
        Args: {
          p_delivery_status: string
          p_invitation_id: string
          p_status?: string | null
        }
        Returns: unknown
      }
      validate_operational_note: {
        Args: {
          p_text: string
        }
        Returns: unknown
      }
      validate_password_policy: {
        Args: {
          p_password: string
        }
        Returns: unknown
      }
      validate_route_shape_geojson: {
        Args: {
          p_geojson: Json
        }
        Returns: unknown
      }
      validate_spatial_viewport_bounds: {
        Args: {
          p_east_longitude: number
          p_north_latitude: number
          p_south_latitude: number
          p_west_longitude: number
        }
        Returns: unknown
      }
      write_audit_event: {
        Args: {
          p_action: string
          p_detail?: Json | null
          p_ip_address?: string | null
          p_outcome?: string | null
          p_target_id?: string | null
          p_target_label?: string | null
          p_target_type?: string | null
        }
        Returns: unknown
      }
    }
    Enums: {
      profile_status: "invited" | "active" | "suspended" | "disabled"
      user_role: "platform_super_admin" | "tenant_admin" | "school_admin" | "transportation_admin" | "driver" | "guardian"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
