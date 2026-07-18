import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { School } from '@/types/organization';
import type { Student } from '@/types/studentGuardian';

export interface StudentFormInput {
  firstName: string;
  lastName: string;
  preferredName: string;
  grade: string;
  schoolId: string;
}

export function StudentForm({
  title,
  schools,
  initial,
  onSubmit,
  onCancel,
}: {
  title: string;
  schools: School[];
  initial?: Student;
  onSubmit: (input: StudentFormInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? '');
  const [lastName, setLastName] = useState(initial?.last_name ?? '');
  const [preferredName, setPreferredName] = useState(initial?.preferred_name ?? '');
  const [grade, setGrade] = useState(initial?.grade ?? '');
  const [schoolId, setSchoolId] = useState(initial?.school_id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setFormError('First name and last name are required.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        firstName,
        lastName,
        preferredName,
        grade,
        schoolId,
      });
    } finally {
      setSaving(false);
    }
  }

  const fieldClassName =
    'mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base';
  const labelClassName = 'block text-sm font-semibold text-gray-700';

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold text-navy-900">{title}</h2>
      {formError && (
        <p className="mt-2 text-sm font-semibold text-danger-700">{formError}</p>
      )}
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <label className={labelClassName} htmlFor="student-first-name">
          First name
          <input
            id="student-first-name"
            type="text"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className={fieldClassName}
            required
          />
        </label>
        <label className={labelClassName} htmlFor="student-last-name">
          Last name
          <input
            id="student-last-name"
            type="text"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            className={fieldClassName}
            required
          />
        </label>
        <label className={labelClassName} htmlFor="student-preferred-name">
          Preferred name (optional)
          <input
            id="student-preferred-name"
            type="text"
            value={preferredName}
            onChange={(event) => setPreferredName(event.target.value)}
            className={fieldClassName}
          />
        </label>
        <label className={labelClassName} htmlFor="student-grade">
          Grade (optional)
          <input
            id="student-grade"
            type="text"
            value={grade}
            onChange={(event) => setGrade(event.target.value)}
            className={fieldClassName}
          />
        </label>
        <label className={labelClassName} htmlFor="student-school">
          School (optional)
          <select
            id="student-school"
            value={schoolId}
            onChange={(event) => setSchoolId(event.target.value)}
            className={fieldClassName}
          >
            <option value="">No school</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row">
          <Button type="submit" loading={saving}>
            Save student
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
