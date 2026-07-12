import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';

export function AdminTaskCard({ title, description, to, action }: { title: string; description: string; to: string; action: string }) {
  return (
    <Card className="flex h-full flex-col p-5">
      <h2 className="text-lg font-bold text-navy-900">{title}</h2>
      <p className="mt-2 flex-1 text-sm text-gray-600">{description}</p>
      <Link className="mt-4 inline-flex font-semibold text-navy-700 underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" to={to}>{action}</Link>
    </Card>
  );
}
