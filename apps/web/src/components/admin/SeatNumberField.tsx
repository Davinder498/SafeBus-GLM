import { Button } from '@/components/ui/Button';

export function SeatNumberField({
  value,
  onChange,
  capacity,
  mixed = false,
}: {
  value: string;
  onChange: (value: string) => void;
  capacity?: number | null;
  mixed?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700">
        Seat number (optional)
        <input
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-3"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <p className="mt-1 text-xs text-slate-600">
        {mixed
          ? 'Outbound and return have different seats. Enter a seat for both, or explicitly clear both seats.'
          : 'Leave blank for no assigned seat. When assigning both directions, the same seat applies to both.'}
        {capacity != null && ` Bus capacity: ${capacity}.`}
      </p>
      {mixed && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => onChange('')}
        >
          Clear both seats
        </Button>
      )}
    </div>
  );
}
