import type { Database as HostedDatabase, Json } from './database.generated';

// Forward migration contracts, kept separate from the immutable hosted snapshot.
// Regenerate database.generated.ts only after the protected production release.
export type Database = Omit<HostedDatabase, 'public'> & {
  public: Omit<HostedDatabase['public'], 'Functions'> & {
    Functions: HostedDatabase['public']['Functions'] & {
      get_bus_subscription_access: { Args: Record<string, never>; Returns: Json };
      get_platform_subscription_summaries: { Args: Record<string, never>; Returns: Json };
    };
  };
};
export type { Json } from './database.generated';
