import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { verifyActiveCallerSession, verifyRecentCallerAuthentication } from './session-security.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'},
  body: JSON.stringify(body),
});
const clean = value => typeof value === 'string' ? value.trim() : '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ORIGIN = process.env.SAFEBUS_APP_ORIGIN || 'https://safebus.kids';
export const config = {
  path: '/.netlify/functions/district-agreements',
  rateLimit: { windowLimit: 12, windowSize: 60, aggregateBy: ['ip','domain'] },
};
function clients(token) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error('not_configured');
  const opts = {auth:{autoRefreshToken:false,persistSession:false}};
  const admin = createClient(url,service,opts);
  const user = token ? createClient(url,anon,{...opts,global:{headers:{Authorization:`Bearer ${token}`}}}) : null;
  return {admin,user};
}
async function requireCaller(event, role, sensitive=false) {
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return {error:json(401,{error:'Sign in to manage this agreement.'})};
  const ctx = clients(token);
  const {data,error} = await ctx.user.auth.getUser(token);
  if (error || !data?.user) return {error:json(401,{error:'Sign in again.'})};
  const failed = await verifyActiveCallerSession(ctx.user);
  if (failed) return {error:json(failed.statusCode,{error:failed.message})};
  const {data:profile,error:profileErr} = await ctx.admin.from('profiles')
     .select('id,tenant_id,role,status').eq('id',data.user.id).maybeSingle();
  if (profileErr || profile?.role!==role || profile.status!=='active')
    return {error:json(403,{error:'This action requires an authorized SafeBus administrator.'})};
  const assurance = await ctx.user.auth.mfa.getAuthenticatorAssuranceLevel(token);
  if (assurance.error || assurance.data?.currentLevel!=='aal2')
    return {error:json(403,{error:'Complete administrator MFA before managing agreements.'})};
  if (sensitive) {
    const recent = await verifyRecentCallerAuthentication(ctx.user,token,profile.id);
    if (recent) return {error:json(recent.statusCode,{error:recent.message})};
  }
  return {...ctx,profile,token};
}
async function rpc(client,name,args) {
  const {data,error} = await client.rpc(name,args);
  if (error) throw new Error('agreement_rpc_unavailable');
  return data;
}
export function isSafeSignerToken(value) {return typeof value==='string' && TOKEN.test(value);}
export function signerTokenHash(value) {return createHash('sha256').update(value).digest('hex');}
export function buildSignerEmail(recipientName,link) {
  return {
    subject:'SafeBus — Review and sign your school authority agreement',
    text:`You have been invited to review and electronically sign a school authority agreement for SafeBus. This invitation is intended only for an officer whose signing authority has been separately verified.\n\nReview your agreements: ${link}\n\nThe link expires after 48 hours. Do not forward it. If this is unexpected, contact info@safebus.kids. The link does not provide access to student or transportation records.`,
  };
}
async function deliverInvite(email,token) {
  const key=clean(process.env.SAFEBUS_EMAIL_PROVIDER_API_KEY);
  const from=clean(process.env.SAFEBUS_EMAIL_FROM);
  if (!key || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) throw new Error('email_unavailable');
  const origin = new URL(ORIGIN);
  if (origin.protocol!=='https:' || origin.origin!=='https://safebus.kids') throw new Error('origin_unavailable');
  const link=`${origin.origin}/agreements/sign#token=${encodeURIComponent(token)}`;
  const message=buildSignerEmail('',link);
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
    signal:AbortSignal.timeout(10000),
    body:JSON.stringify({from:`SafeBus agreements <${from}>`,to:[email],subject:message.subject,text:message.text}),
  });
  if (!response.ok) throw new Error('email_unavailable');
  const data=await response.json().catch(()=>null);
  if (!data?.id) throw new Error('email_unavailable');
}
const validMethod = event => event.httpMethod==='POST';
const validBody = event => event.body && Buffer.byteLength(event.body,'utf8')<=235000
  && (event.headers?.['content-type'] || event.headers?.['Content-Type'] || '').startsWith('application/json');
function sameOrigin(event) {
  const origin=event.headers?.origin || event.headers?.Origin || '';
  if (!origin) return false;
  const configured=clean(process.env.SAFEBUS_APP_ORIGIN) || 'https://safebus.kids';
  return origin===configured;
}
export async function handler(event) {
  let action='unknown';
  try {
    if (!validMethod(event)) return json(405,{error:'Method not allowed.'});
    if (!validBody(event)) return json(400,{error:'Invalid agreement request.'});
    if (!sameOrigin(event)) return json(403,{error:'This agreement action must be started from SafeBus.'});
    let body;
    try {body=JSON.parse(event.body);} catch {return json(400,{error:'Invalid agreement request.'});}
    if (!body || typeof body!=='object' || Array.isArray(body)) return json(400,{error:'Invalid agreement request.'});
    action=clean(body.action);
    if (action==='signer_preview' || action==='signer_sign') {
      if (!isSafeSignerToken(body.token)) return json(404,{error:'Invitation is invalid or expired.'});
      const {admin}=clients();
      const hash=signerTokenHash(body.token);
      if (action==='signer_preview') {
        const data=await rpc(admin,'server_get_district_signer_package',{p_token_sha256:hash});
        return data ? json(200,data) : json(404,{error:'Invitation is invalid or expired.'});
      }
      if (!SHA.test(body.bundleHash || '') || typeof body.signerName!=='string' || typeof body.signerTitle!=='string'
          || body.electronicConsent!==true || body.bindingAuthority!==true)
        return json(400,{error:'Review all documents and confirm signing authority before signing.'});
      const data=await rpc(admin,'server_sign_district_agreement',{
        p_token_sha256:hash,p_bundle_sha256:body.bundleHash,p_signer_name:body.signerName,
        p_signer_title:body.signerTitle,p_electronic_consent:true,p_binding_authority:true,
      });
      return json(200,data);
    }
    const isAdmin=['status_platform','issue','verify','dispatch','countersign','activate'].includes(action);
    const isTenant=['status_tenant','request_signer'].includes(action);
    if (!isAdmin && !isTenant) return json(400,{error:'Unknown agreement action.'});
    const ctx=await requireCaller(event,isAdmin?'platform_super_admin':'tenant_admin',
      ['issue','verify','dispatch','countersign','activate'].includes(action));
    if (ctx.error) return ctx.error;
    const {user,admin}=ctx;
    if (action==='status_tenant') return json(200,await rpc(user,'get_district_agreement_status_secure',{}));
    if (action==='status_platform') {
      if (!UUID.test(body.tenantId || '')) return json(400,{error:'Invalid school authority.'});
      return json(200,await rpc(user,'get_district_agreement_status_secure',{p_tenant_id:body.tenantId}));
    }
    if (action==='request_signer') {
      const data=await rpc(user,'request_district_agreement_signer',{
        p_signer_name:body.signerName,p_signer_title:body.signerTitle,p_signer_email:body.signerEmail,
      });
      return json(200,data);
    }
    if (action==='issue') {
      if (!UUID.test(body.tenantId || '') || !Array.isArray(body.documents))
        return json(400,{error:'Review the district and complete all eight agreement documents.'});
      const data=await rpc(user,'platform_issue_district_agreement',{
        p_tenant_id:body.tenantId,p_documents:body.documents,p_business_approval_ref:body.businessApprovalRef,
      });
      return json(200,data);
    }
    if (!UUID.test(body.signerId || '') && ['verify','dispatch'].includes(action))
      return json(400,{error:'Invalid signing officer request.'});
    if (action==='verify') return json(200,await rpc(user,'platform_verify_district_signer',{
      p_signer_id:body.signerId,p_authority_ref:body.authorityRef,
    }));
    if (action==='dispatch') {
      const token=randomBytes(32).toString('base64url');
      const data=await rpc(admin,'server_issue_district_signer_token',{
        p_signer_id:body.signerId,p_token_sha256:signerTokenHash(token),
      });
      try {await deliverInvite(data.recipientEmail,token);}
      catch {
        await rpc(admin,'server_revoke_district_signer_token',{p_signer_id:body.signerId});
        return json(503,{error:'The signing invitation could not be delivered. Request a new invitation.'});
      }
      return json(200,{state:'invited'});
    }
    if (!UUID.test(body.tenantId || '') || !SHA.test(body.bundleHash || ''))
      return json(400,{error:'Invalid agreement package.'});
    if (action==='countersign') return json(200,await rpc(user,'platform_countersign_district_agreement',{
      p_tenant_id:body.tenantId,p_bundle_sha256:body.bundleHash,
      p_provider_name:body.providerName,p_provider_title:body.providerTitle,
      p_provider_authority_ref:body.providerAuthorityRef,p_electronic_consent:body.electronicConsent===true,
    }));
    if (action==='activate') return json(200,await rpc(user,'platform_activate_district_agreement',{
      p_tenant_id:body.tenantId,p_bundle_sha256:body.bundleHash,p_approval_refs:body.approvalRefs,
    }));
    return json(400,{error:'Unknown agreement action.'});
  } catch {
    // Never log raw tokens, signer email, document text, provider errors or URLs.
    console.error(JSON.stringify({event:'district_agreement_action_failed',action}));
    return json(503,{error:'Agreement action could not be confirmed. Refresh agreement status before retrying.'});
  }
}
