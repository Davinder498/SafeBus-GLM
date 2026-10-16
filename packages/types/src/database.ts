import type { Database as HostedDatabase, Json } from './database.generated';

// Forward migration contracts, kept separate from the immutable hosted snapshot.
// Regenerate database.generated.ts only after the protected production release.
export type Database = Omit<HostedDatabase, 'public'> & {
  public: Omit<HostedDatabase['public'], 'Functions'> & {
    Functions: HostedDatabase['public']['Functions'] & {
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
