import { Clock, ExternalLink, Mail, Phone } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { SupportContact } from '@/services/supportDirectoryService';

export function SupportContactCard({ title, contact }: { title: string; contact: SupportContact }) {
  return (
    <Card className="p-5" data-testid="support-contact-card">
      <h2 className="text-xl font-bold text-navy-900">{title}</h2>
      <p className="mt-1 font-semibold text-slate-700">{contact.displayName}</p>
      <div className="mt-4 space-y-3 text-sm">
        <a
          className="flex min-h-12 items-center gap-3 rounded-lg text-navy-700 underline underline-offset-4"
          href={`mailto:${contact.email}`}
        >
          <Mail className="h-5 w-5 shrink-0" aria-hidden /> {contact.email}
        </a>
        {contact.phone && (
          <a
            className="flex min-h-12 items-center gap-3 rounded-lg text-navy-700 underline underline-offset-4"
            href={`tel:${contact.phone}`}
          >
            <Phone className="h-5 w-5 shrink-0" aria-hidden /> {contact.phone}
          </a>
        )}
        {contact.websiteUrl && (
          <a
            className="flex min-h-12 items-center gap-3 rounded-lg text-navy-700 underline underline-offset-4"
            href={contact.websiteUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-5 w-5 shrink-0" aria-hidden /> Open support website
          </a>
        )}
        {contact.supportHours && (
          <p className="flex items-start gap-3 text-slate-600">
            <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {contact.supportHours}
          </p>
        )}
      </div>
      {contact.instructions && (
        <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {contact.instructions}
        </p>
      )}
    </Card>
  );
}
