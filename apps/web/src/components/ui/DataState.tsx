import { Card } from './Card';

interface DataStateProps {
  title: string;
  message: string;
}

export function DataState({ title, message }: DataStateProps) {
  return (
    <Card className="p-6 text-center">
      <p className="text-base font-semibold text-navy-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-gray-600">{message}</p>
    </Card>
  );
}
