import type { ProfileRole } from '@/contexts/AuthContext';

export type ProfileStatus = 'invited' | 'active' | 'suspended' | 'disabled';

export interface Tenant {
  id: string;
  name: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface School {
  id: string;
  tenant_id: string;
  name: string;
  city: string | null;
  province: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationProfile {
  id: string;
  tenant_id: string | null;
  school_id: string | null;
  full_name: string;
  email: string;
  role: ProfileRole;
  status: ProfileStatus;
  created_at: string;
  updated_at: string;
}

export interface OrganizationContext {
  tenant: Tenant | null;
  school: School | null;
}
