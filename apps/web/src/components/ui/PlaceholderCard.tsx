import { Card } from './Card';

interface PlaceholderCardProps {
  title: string;
  description: string;
}

export function PlaceholderCard({ title, description }: PlaceholderCardProps) {
  return (
    <Card className="flex min-h-[220px] items-center justify-center bg-gray-50 p-6 text-center">
      <div>
        <p className="text-base font-semibold text-navy-900">{title}</p>
        <p className="mt-2 max-w-md text-sm leading-6 text-gray-600">{description}</p>
      </div>
    </Card>
  );
}
