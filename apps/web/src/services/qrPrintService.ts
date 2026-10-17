import { supabase, supabaseConfigError } from '@/lib/supabase';
import { isLikelyStudentQrToken } from '@/utils/studentQr';
import { isLikelyBusQrToken } from '@/utils/busQr';

export type QrKind = 'student' | 'bus';
export interface PrintableQr {
  credentialId: string | null;
  token: string | null;
  status: 'ready' | 'missing' | 'needs_original';
}
export async function getPrintableQr(
  kind: QrKind,
  entityId: string,
  options: {
    issueMissing?: boolean;
    originalToken?: string;
    signal?: AbortSignal;
  } = {},
): Promise<PrintableQr> {
  if (!supabase) throw new Error(supabaseConfigError ?? 'QR printing is unavailable.');
  const request = supabase.rpc('admin_get_printable_qr', {
    p_kind: kind,
    p_entity_id: entityId,
    p_issue_missing: options.issueMissing ?? false,
    p_original_token: options.originalToken ?? null,
  });
  const { data, error } = await (options.signal ? request.abortSignal(options.signal) : request);
  options.signal?.throwIfAborted();
  if (error) throw new Error('The QR could not be prepared. Check access and try again.');
  const row = data?.[0];
  if (
    !row ||
    !['ready', 'missing', 'needs_original'].includes(row.print_status) ||
    (row.print_status === 'ready' &&
      (!row.credential_id ||
        !row.raw_token ||
        !(kind === 'student'
          ? isLikelyStudentQrToken(row.raw_token)
          : isLikelyBusQrToken(row.raw_token))))
  ) {
    throw new Error('The printable QR could not be verified.');
  }
  return {
    credentialId: row.credential_id,
    token: row.raw_token,
    status: row.print_status as PrintableQr['status'],
  };
}

/** Decode locally; the image bytes never leave this browser. */
export async function readOriginalQrImage(file: File): Promise<string> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  ) {
    throw new Error('Choose a PNG, JPEG or WebP QR image smaller than 10 MB.');
  }
  const { BrowserQRCodeReader } = await import('@zxing/browser');
  const url = URL.createObjectURL(file);
  try {
    return (await new BrowserQRCodeReader().decodeFromImageUrl(url)).getText();
  } catch {
    throw new Error('No readable QR was found in this image. Try a clear photo of the original.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
