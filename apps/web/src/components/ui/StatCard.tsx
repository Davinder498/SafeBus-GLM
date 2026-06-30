import { Card } from './Card';

interface StatCardProps {
  label: string;
  value: string | number;
  detail: string;
}

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-normal text-navy-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{detail}</p>
    </Card>
  );
}
