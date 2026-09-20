export const inquiryTopics = [
  'pilot_consultation',
  'pricing_procurement',
  'product_questions',
  'partnership',
  'other',
] as const;

export type InquiryTopic = (typeof inquiryTopics)[number];

export interface TenantInquiryInput {
  requestId: string;
  name: string;
  workEmail: string;
  organization: string;
  role: string;
  topic: InquiryTopic;
  message: string;
  phone?: string;
  website?: string;
}

export async function submitTenantInquiry(input: TenantInquiryInput): Promise<void> {
  const response = await fetch('/.netlify/functions/tenant-inquiry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'Too many inquiries were sent from this connection. Please wait and try again.'
        : 'We could not send your inquiry right now. Please try again later.',
    );
  }
}
