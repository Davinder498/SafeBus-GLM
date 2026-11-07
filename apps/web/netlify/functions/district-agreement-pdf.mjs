// Authenticated on-demand PDF rendering from the immutable executed contract snapshot.
// No untrusted document HTML, publicly accessible storage, or server-side file writes.
import { createServerClients, json, UUID_PATTERN } from './billing-shared.mjs';
import { verifyActiveCallerSession } from './session-security.mjs';

function printable(value) {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/\u2022/g, '*')
    .replace(/\u00A0/g, ' ')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\r\n\t]/g, '?');
}
function wrapLine(text, width = 92) {
  const words = printable(text).replace(/\t/g,'  ').split(/\s+/);
  const result = [];
  let current = '';
  for (const word of words) {
    if (!word) continue;
    if (current && (current.length + 1 + word.length > width)) {
      result.push(current);
      current = '';
    }
    if (word.length > width) {
      if (current) { result.push(current); current=''; }
      for (let j=0; j<word.length; j+=width) result.push(word.slice(j,j+width));
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) result.push(current);
  return result.length ? result : [''];
}
function serializePdf(rawText) {
  const lines = [];
  for (const line of rawText.split(/\r?\n/)) {
    lines.push(...wrapLine(line));
  }
  const maxLines = 53;
  const count = Math.max(1, Math.ceil(lines.length / maxLines));
  if (count > 400) throw new Error('The executed agreement exceeds the PDF export limit.');
  const objects = [null];
  const add = (value) => { objects.push(value); return objects.length - 1; };
  const catalog = add('');
  const pageTree = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const pages = [];
  for (let p=0; p<count; p++) {
    const chunk = lines.slice(p*maxLines,(p+1)*maxLines);
    const escapePdf = (s) => s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const commands = ['BT','/F1 8.5 Tf','11 TL','45 745 Td'];
    chunk.forEach((line,i) => {
      if (i) commands.push('T*');
      commands.push('(' + escapePdf(line) + ') Tj');
    });
    commands.push('ET');
    const stream = commands.join('\n')+'\n';
    const contentId = add(`<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}endstream`);
    const pageId = add(`<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pages.push(pageId);
  }
  objects[catalog] = `<< /Type /Catalog /Pages ${pageTree} 0 R >>`;
  objects[pageTree] = `<< /Type /Pages /Kids [${pages.map(p=>p+' 0 R').join(' ')}] /Count ${count} >>`;
  const chunks = ['%PDF-1.4\n'];
  const offsets=[0];
  let offset=Buffer.byteLength(chunks[0],'ascii');
  for (let i=1; i<objects.length; i++) {
    offsets.push(offset);
    const obj = `${i} 0 obj\n${objects[i]}\nendobj\n`;
    chunks.push(obj); offset+=Buffer.byteLength(obj,'ascii');
  }
  const start=offset;
  chunks.push(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for (let i=1;i<offsets.length;i++) chunks.push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  chunks.push(`trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${start}\n%%EOF\n`);
  return Buffer.from(chunks.join(''),'ascii');
}
export function renderExecutedAgreementPdf(receipt) {
  const snap = receipt?.document_snapshot;
  if (!snap || !Array.isArray(snap.documents) || snap.documents.length !== 8 ||
      !receipt.receipt_sha256 || !receipt.bundle_sha256) {
    throw new Error('Executed agreement record is incomplete.');
  }
  const text = [
    'SAFEBUS - EXECUTED SCHOOL AUTHORITY AGREEMENT',
    'Provider: ' + snap.provider,
    'Customer: ' + snap.customer,
    'Signed UTC: ' + receipt.signed_at,
    'Signer name: ' + snap.signer?.name,
    'Signer title: ' + snap.signer?.title,
    'Signer business email: ' + snap.signer?.email,
    'Authenticated signer ID: ' + snap.signer?.user_id,
    'Agreement package ID: ' + snap.package_id,
    'Package SHA-256: ' + receipt.bundle_sha256,
    'Immutable receipt SHA-256: ' + receipt.receipt_sha256,
    'Affirmations: electronic-record consent, binding-authority declaration,',
    'and deliberate acceptance of the complete identified document package.',
    '',
    '=== CONTRACT TEXT: ALL INCORPORATED DOCUMENTS ===',
    '',
    ...snap.documents.flatMap(d=>[
      '============================================================',
      d.title + ' (' + d.kind + ')',
      'Document version: ' + d.version,
      'Document SHA-256: ' + d.sha256,
      '',
      d.body,
      ''
    ]),
    'END OF EXECUTED AGREEMENT PACKAGE',
  ].join('\n');
  return serializePdf(text);
}
export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405,{error:'Method not allowed.'});
  if ((event.body?.length||0)>1024) return json(400,{error:'Invalid agreement request.'});
  let input;
  try { input=JSON.parse(event.body||'{}'); } catch { return json(400,{error:'Invalid request.'}); }
  if (!input || !UUID_PATTERN.test(input.receiptId??'') ||
     Object.keys(input).some(x=>x!=='receiptId')) return json(400,{error:'Invalid receipt identifier.'});
  const auth=event.headers?.authorization||event.headers?.Authorization||'';
  if (!auth.startsWith('Bearer ')) return json(401,{error:'Sign in required.'});
  try {
    const { user }=createServerClients(auth.slice(7));
    const { data: who,error: authError }=await user.auth.getUser();
    if (authError || !who.user) return json(401,{error:'Invalid session.'});
    const failure=await verifyActiveCallerSession(user);
    if (failure) return json(failure.statusCode,{error:failure.message});
    const {data,error}=await user.rpc('get_my_district_agreement_receipt',{
      p_receipt_id:input.receiptId
    });
    if (error||!data) return json(403,{error:'Executed agreement is not available to this account.'});
    const pdf=renderExecutedAgreementPdf(data);
    return {
      statusCode:200,
      headers:{
        'content-type':'application/pdf',
        'content-disposition':`attachment; filename="SafeBus-Executed-${input.receiptId}.pdf"`,
        'cache-control':'no-store',
        'x-content-type-options':'nosniff'
      },
      body:pdf.toString('base64'),isBase64Encoded:true
    };
  } catch {
    return json(503,{error:'Executed agreement export unavailable. Please retry.'});
  }
}
