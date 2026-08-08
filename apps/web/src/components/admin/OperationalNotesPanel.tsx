import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useAuth } from '@/contexts/useAuth';
import {
  createOperationalNote,
  getOperationalNotes,
  type OperationalNote,
  type OperationalNoteTarget,
  type OperationalNoteType,
} from '@/services/phase6OperationsService';

const NOTE_TYPES: Array<{ value: OperationalNoteType; label: string }> = [
  { value: 'general', label: 'General operation' },
  { value: 'schedule_change', label: 'Schedule change' },
  { value: 'mechanical_note', label: 'Mechanical' },
  { value: 'driver_coaching', label: 'Driver coaching' },
  { value: 'incident_followup', label: 'Incident follow-up' },
];

export function OperationalNotesPanel({
  targetEntity,
  targetId,
}: {
  targetEntity: OperationalNoteTarget;
  targetId: string;
}) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<OperationalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteType, setNoteType] = useState<OperationalNoteType>('general');
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const canWrite =
    profile?.role === 'tenant_admin' ||
    profile?.role === 'school_admin' ||
    profile?.role === 'transportation_admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNotes(await getOperationalNotes(targetEntity, targetId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load operational notes.');
    } finally {
      setLoading(false);
    }
  }, [targetEntity, targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.tenant_id || !noteText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createOperationalNote({
        tenantId: profile.tenant_id,
        targetEntity,
        targetId,
        noteType,
        noteText: noteText.trim(),
      });
      setNoteText('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the operational note.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5" data-testid={`operational-notes-${targetEntity}-${targetId}`}>
      <h2 className="text-lg font-bold text-navy-900">Operational notes</h2>
      <p className="mt-1 text-sm text-gray-600">
        Use a controlled category. Do not enter student names, health, address, custody, contact, or
        other personal information.
      </p>

      {error && (
        <p
          className="mt-4 rounded-lg bg-danger-50 p-3 text-sm font-semibold text-danger-700"
          role="alert"
        >
          {error}
        </p>
      )}

      {canWrite && (
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)}>
          <Field label="Note category" htmlFor={`operational-note-type-${targetId}`}>
            <Select
              id={`operational-note-type-${targetId}`}
              value={noteType}
              onChange={(event) => setNoteType(event.target.value as OperationalNoteType)}
            >
              {NOTE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Operational detail (max 500 characters)"
            htmlFor={`operational-note-text-${targetId}`}
          >
            <Textarea
              id={`operational-note-text-${targetId}`}
              rows={3}
              maxLength={500}
              required
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Operational facts only; no student information"
            />
          </Field>
          <div>
            <Button type="submit" size="sm" loading={saving}>
              Add note
            </Button>
          </div>
        </form>
      )}

      <div className="mt-5 border-t border-gray-100 pt-4">
        {loading ? (
          <p className="text-sm text-gray-600">Loading notes...</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-gray-600">No operational notes recorded.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-navy-900">
                  {NOTE_TYPES.find((type) => type.value === note.note_type)?.label ??
                    note.note_type}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-gray-700">{note.note_text}</p>
                <p className="mt-2 text-xs text-gray-500">
                  {new Date(note.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
