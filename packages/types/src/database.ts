import type { Database as HostedDatabase, Json } from './database.generated';

type HostedAssignments = HostedDatabase['public']['Tables']['student_bus_assignments'];
type SeatedAssignments = Omit<HostedAssignments, 'Row' | 'Insert' | 'Update'> & {
  Row: HostedAssignments['Row'] & { seat_number: number | null };
  Insert: HostedAssignments['Insert'] & { seat_number?: number | null };
  Update: HostedAssignments['Update'] & { seat_number?: number | null };
};
type HostedFunctions = HostedDatabase['public']['Functions'];
type HostedRoutes = HostedDatabase['public']['Tables']['routes'];
type CalendarRoutes = Omit<HostedRoutes, 'Row' | 'Insert' | 'Update'> & {
  Row: HostedRoutes['Row'] & { service_schedule_mode: 'weekly' | 'dates'; service_dates: string[] };
  Insert: HostedRoutes['Insert'] & {
    service_schedule_mode?: 'weekly' | 'dates';
    service_dates?: string[];
  };
  Update: HostedRoutes['Update'] & {
    service_schedule_mode?: 'weekly' | 'dates';
    service_dates?: string[];
  };
};
type DriverManifestSeatRow = {
  active_trip_id: string;
  student_id: string | null;
  student_display_name: string | null;
  route_name: string | null;
  trip_name: string | null;
  bus_number: string | null;
  trip_status: string | null;
  trip_direction: string | null;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  assignment_status: string | null;
  pickup_event_time: string | null;
  dropoff_event_time: string | null;
  student_trip_status: 'not_picked_up' | 'picked_up' | 'dropped_off' | null;
  seat_number: number | null;
};
type GuardianStudentSeatRow = {
  student_id: string;
  bus_number: string;
  trip_name: string;
  direction: string;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
  seat_number: number | null;
};

// Forward migration contracts, kept separate from the immutable hosted snapshot.
// Regenerate database.generated.ts only after the protected production release.
export type Database = Omit<HostedDatabase, 'public'> & {
  public: Omit<HostedDatabase['public'], 'Functions' | 'Tables'> & {
    Tables: Omit<HostedDatabase['public']['Tables'], 'student_bus_assignments' | 'routes'> & {
      student_bus_assignments: SeatedAssignments;
      routes: CalendarRoutes;
    };
    Functions: HostedDatabase['public']['Functions'] & {
      get_my_district_agreement: { Args: Record<string, never>; Returns: Json };
      get_my_participant_agreement: { Args: Record<string, never>; Returns: Json };
      accept_my_participant_agreement: { Args: {
        p_document_id: string; p_terms_sha256: string;
        p_terms_accepted: boolean; p_notice_acknowledged: boolean;
      }; Returns: Json };
      platform_get_participant_terms: { Args: Record<string, never>; Returns: Json };
      platform_publish_participant_terms: { Args: { p_document_id: string }; Returns: Json };
      get_platform_district_agreement: { Args: { p_tenant_id: string }; Returns: Json };
      accept_my_district_agreement: { Args: {
        p_package_id: string; p_bundle_sha256: string;
        p_signer_name: string; p_signer_title: string;
        p_electronic_consent: boolean; p_authority_attested: boolean;
        p_signature_intent: boolean;
      }; Returns: Json };
      list_my_district_agreement_receipts: { Args: Record<string, never>; Returns: Json };
      get_my_district_agreement_receipt: { Args: { p_receipt_id: string }; Returns: Json };
      platform_publish_agreement_document: { Args: {
        p_kind: string; p_title: string; p_version: string; p_body: string;
      }; Returns: Json };
      platform_list_agreement_documents: { Args: Record<string, never>; Returns: Json };
      platform_publish_agreement_catalog: { Args: { p_document_ids: string[] }; Returns: Json };
      platform_get_agreement_catalog: { Args: Record<string, never>; Returns: Json };
      district_agreement_billing_allowed: { Args: {p_tenant_id: string}; Returns: boolean };
      get_admin_trip_operations: {
        Args: {
          p_from_date?: string | null;
          p_to_date?: string | null;
          p_status?: string | null;
          p_page?: number;
          p_page_size?: number;
        };
        Returns: Json;
      };
      get_admin_trip_detail: { Args: { p_trip_id: string }; Returns: Json };
      search_authority_reference_directory: { Args: { p_query: string }; Returns: Json };
      search_authority_reference_directory_v2: {
        Args: { p_query: string; p_offset?: number };
        Returns: Json;
      };
      platform_check_authority_onboarding: {
        Args: {
          p_authority_code: string | null;
          p_support_contact: Json;
          p_support_confirmed: boolean;
        };
        Returns: boolean;
      };
      platform_finalize_tenant_invitation_v2: {
        Args: {
          p_auth_user_id: string;
          p_tenant_name: string;
          p_tenant_type: string;
          p_admin_name: string;
          p_admin_email: string;
          p_authority_code: string | null;
          p_support_contact: Json;
          p_support_confirmed: boolean;
        };
        Returns: Json;
      };
      get_support_directory_v2: { Args: Record<string, never>; Returns: Json };
      update_tenant_support_contact_v2: {
        Args: HostedFunctions['update_tenant_support_contact']['Args'] & {
          p_address: string | null;
        };
        Returns: undefined;
      };
      claim_guardian_notification_email_batch_v2: HostedFunctions['claim_guardian_notification_email_batch'];
      claim_notification_deliveries: {
        Args: {
          p_channel: 'push' | 'email';
          p_worker_id: string;
          p_limit?: number;
          p_provider_minute?: number;
        };
        Returns: Json[];
      };
      resolve_notification_deliveries: {
        Args: { p_channel: 'push' | 'email'; p_worker_id: string; p_ids: string[] };
        Returns: Json[];
      };
      settle_notification_deliveries: {
        Args: { p_channel: 'push' | 'email'; p_worker_id: string; p_results: Json };
        Returns: number;
      };
      expand_notification_audiences: { Args: { p_limit?: number }; Returns: number };
      resolve_notification_email_payload: {
        Args: { p_outbox_id: string };
        Returns: Array<{
          recipient_profile_id: string;
          recipient_email: string;
          notification_type: string;
          title: string;
          body: string;
          event_occurred_at: string;
          tenant_timezone: string;
          idempotency_key: string;
        }>;
      };
      admin_get_printable_qr: {
        Args: {
          p_kind: string;
          p_entity_id: string;
          p_issue_missing?: boolean;
          p_original_token?: string | null;
        };
        Returns: Array<{
          credential_id: string | null;
          raw_token: string | null;
          print_status: string;
        }>;
      };
      admin_set_student_bus_service_with_seat: {
        Args: HostedFunctions['admin_set_student_bus_service']['Args'] & {
          p_seat_number: number | null;
        };
        Returns: SeatedAssignments['Row'][];
      };
      get_admin_bus_services_with_capacity: { Args: Record<string, never>; Returns: Json };
      get_driver_active_trip_student_manifest_v2: {
        Args: Record<string, never>;
        Returns: DriverManifestSeatRow[];
      };
      get_guardian_student_stops_v2: {
        Args: Record<string, never>;
        Returns: GuardianStudentSeatRow[];
      };
      get_bus_subscription_access: { Args: Record<string, never>; Returns: Json };
      get_platform_subscription_summaries: { Args: Record<string, never>; Returns: Json };
      billing_claim_catalog_operation: {
        Args: {
          p_request_id: string;
          p_actor_id: string;
          p_action: string;
          p_hash: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      billing_finish_catalog_operation: {
        Args: { p_request_id: string; p_actor_id: string; p_response: Json };
        Returns: undefined;
      };
      billing_get_pending_catalog_operation: { Args: { p_actor_id: string }; Returns: Json };
    };
  };
};
export type { Json } from './database.generated';
