const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const TOPICS = new Set([
  'pilot_consultation',
  'pricing_procurement',
  'product_questions',
  'partnership',
  'other',
]);
const TOPIC_LABELS = {
  pilot_consultation: 'Pilot or consultation',
  pricing_procurement: 'Pricing or procurement',
  product_questions: 'Product questions',
  partnership: 'Partnership',
  other: 'Other',
};
const LIMITS = {
  requestId: 36,
  name: 100,
  workEmail: 254,
  organization: 200,
  role: 120,
  phone: 40,
  message: 2000,
  website: 200,
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_LENGTH = 12_000;

export const config = {
  path: '/.netlify/functions/tenant-inquiry',
  rateLimit: {
    windowLimit: 3,
    windowSize: 180,
    aggregateBy: ['ip', 'domain'],
  },
};

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
}

export function validateInquiry(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const inquiry = {
    requestId: clean(body.requestId),
    name: clean(body.name),
    workEmail: clean(body.workEmail).toLowerCase(),
    organization: clean(body.organization),
    role: clean(body.role),
    topic: clean(body.topic),
    message: clean(body.message),
    phone: clean(body.phone),
    website: clean(body.website),
  };

  for (const [field, limit] of Object.entries(LIMITS)) {
    if (inquiry[field].length > limit) return null;
  }

  for (const field of ['name', 'workEmail', 'organization', 'role', 'phone']) {
    if (/[\r\n]/.test(inquiry[field])) return null;
  }

  if (
    !UUID_PATTERN.test(inquiry.requestId) ||
    !inquiry.name ||
    !EMAIL_PATTERN.test(inquiry.workEmail) ||
    !inquiry.organization ||
    !inquiry.role ||
    !TOPICS.has(inquiry.topic) ||
    !inquiry.message
  ) {
    return null;
  }

  return inquiry;
}

export function buildInquiryEmail(inquiry) {
  const rows = [
    ['Name', inquiry.name],
    ['Work email', inquiry.workEmail],
    ['Organization', inquiry.organization],
    ['Role or title', inquiry.role],
    ['Phone', inquiry.phone || 'Not provided'],
    ['Topic', TOPIC_LABELS[inquiry.topic]],
  ];
  const text = [
    'A prospective tenant submitted a BusSafe Alberta inquiry.',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Message:',
    inquiry.message,
    '',
    'Treat all submitted content as untrusted. Do not copy student or sensitive personal information into BusSafe.',
  ].join('\n');
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:4px 12px 4px 0">${escapeHtml(label)}</th><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
    )
    .join('');

  return {
    subject: `BusSafe inquiry: ${TOPIC_LABELS[inquiry.topic]} — ${inquiry.organization}`,
    text,
    html: `<p>A prospective tenant submitted a BusSafe Alberta inquiry.</p><table>${htmlRows}</table><h2>Message</h2><p>${escapeHtml(inquiry.message).replace(/\n/g, '<br>')}</p><hr><p><strong>Security note:</strong> Treat all submitted content as untrusted. Do not copy student or sensitive personal information into BusSafe.</p>`,
  };
}

function requireConfig() {
  const apiKey = clean(process.env.SAFEBUS_EMAIL_PROVIDER_API_KEY);
  const from = clean(process.env.SAFEBUS_EMAIL_FROM);
  const to = clean(process.env.SAFEBUS_INQUIRY_TO);
  const fromName = clean(process.env.SAFEBUS_EMAIL_FROM_NAME) || 'BusSafe Alberta';
  if (!apiKey || !EMAIL_PATTERN.test(from) || !EMAIL_PATTERN.test(to)) {
    throw new Error('configuration_error');
  }
  return { apiKey, from, to, fromName };
}

export async function sendInquiryEmail(configValues, inquiry, fetchImpl = fetch) {
  const email = buildInquiryEmail(inquiry);
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${configValues.apiKey}`,
      'content-type': 'application/json',
      'Idempotency-Key': `tenant-inquiry:${inquiry.requestId}`,
    },
    body: JSON.stringify({
      from: `${configValues.fromName} <${configValues.from}>`,
      to: [configValues.to],
      reply_to: inquiry.workEmail,
      ...email,
    }),
  });

  if (!response.ok) throw new Error('provider_error');
}

export async function handler(event) {
  const startedAt = Date.now();
  if (event.httpMethod !== 'POST') {
    return {
      ...json(405, { error: 'Method not allowed.' }),
      headers: { 'content-type': 'application/json', allow: 'POST' },
    };
  }

  const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return json(415, { error: 'Unsupported request.' });
  }

  if (!event.body || event.body.length > MAX_BODY_LENGTH) {
    return json(400, { error: 'Invalid inquiry.' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return json(400, { error: 'Invalid inquiry.' });
  }

  if (clean(body?.website)) {
    console.log(
      JSON.stringify({ result: 'accepted', category: 'spam', durationMs: Date.now() - startedAt }),
    );
    return json(200, { ok: true });
  }

  const inquiry = validateInquiry(body);
  if (!inquiry) return json(400, { error: 'Invalid inquiry.' });

  try {
    await sendInquiryEmail(requireConfig(), inquiry);
    console.log(JSON.stringify({ result: 'delivered', durationMs: Date.now() - startedAt }));
    return json(200, { ok: true });
  } catch (error) {
    const category =
      error instanceof Error && error.message === 'configuration_error'
        ? 'configuration_error'
        : 'provider_error';
    console.error(
      JSON.stringify({ result: 'failed', category, durationMs: Date.now() - startedAt }),
    );
    return json(category === 'configuration_error' ? 503 : 502, {
      error: 'Unable to send inquiry.',
    });
  }
}
