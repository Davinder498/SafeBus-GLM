export type StudentStatus = 'active' | 'inactive' | 'transferred' | 'archived';
export type GuardianStatus = 'active' | 'inactive' | 'suspended' | 'archived';
export type StudentGuardianStatus = 'active' | 'inactive' | 'archived';
export type StudentGuardianRelationship = 'mother' | 'father' | 'guardian' | 'caregiver' | 'other';

export interface Student {
  id: string;
  tenant_id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  grade: string | null;
  school_student_number: string | null;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
}

export interface Guardian {
  id: string;
  tenant_id: string;
  profile_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: GuardianStatus;
  created_at: string;
  updated_at: string;
}

export interface StudentGuardian {
  id: string;
  tenant_id: string;
  student_id: string;
  guardian_id: string;
  relationship: StudentGuardianRelationship;
  can_receive_notifications: boolean;
  status: StudentGuardianStatus;
  created_at: string;
  updated_at: string;
}
