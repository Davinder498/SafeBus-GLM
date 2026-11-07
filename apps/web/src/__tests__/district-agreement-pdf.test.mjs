import { test } from 'vitest';
import assert from 'node:assert/strict';
import { renderExecutedAgreementPdf } from '../../netlify/functions/district-agreement-pdf.mjs';

const testReceipt = () => ({
  signed_at: '2026-11-07T14:00:00Z',
  bundle_sha256: 'a'.repeat(64),
  receipt_sha256: 'b'.repeat(64),
  document_snapshot: {
    provider:'Sachman Gold Inc. (SafeBus)',
    customer:'Test School Authority',
    package_id:'00000000-0000-4000-8000-000000000001',
    signer:{
      user_id:'00000000-0000-4000-8000-000000000002',
      name:'District Admin',
      title:'Transportation Director',
      email:'admin@example.test'
    },
    documents:[
      {kind:'msa',title:'Master Services Agreement',version:'v1',sha256:'c'.repeat(64),
        body:'This agreement governs SafeBus service.\n'.repeat(90)},
      ...['dpa','order_form','security','sla','acceptable_use','data_return','suppliers'].map((kind)=>
        ({kind,title:kind,version:'v1',sha256:'c'.repeat(64),body:'Complete incorporated agreement text.'}))
    ]
  }
});

test('PDF archive export is multipage and includes exact contract sections and audit metadata',()=>{
  const pdf=renderExecutedAgreementPdf(testReceipt());
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.toString('ascii',0,8).startsWith('%PDF-1.4'));
  const bytes=pdf.toString('ascii');
  assert.match(bytes,/Test School Authority/);
  assert.match(bytes,/Transportation Director/);
  assert.match(bytes,/receipt SHA-256/i);
  assert.match(bytes,/Data Processing Agreement|dpa/);
  assert.match(bytes,/\/Count [2-9]/);
  assert.match(bytes,/%%EOF/);
});

test('incomplete or unsigned contract packages cannot yield executed PDF',()=>{
  const receipt=testReceipt();
  receipt.document_snapshot.documents=[];
  assert.throws(()=>renderExecutedAgreementPdf(receipt),/incomplete/i);
  receipt.document_snapshot.documents=[...testReceipt().document_snapshot.documents];
  receipt.receipt_sha256='';
  assert.throws(()=>renderExecutedAgreementPdf(receipt),/incomplete/i);
});
