// Provider removal is idempotent and a lost response is reconciled by the database.
export async function disposeOneAccount(client) {
  const next = await client.rpc('disposal_account_work', { p_action: 'next', p_id: null });
  if (next.error) throw new Error('RETENTION_LIFECYCLE_ACCOUNT_CLAIM');
  if (next.data === null) return 'idle';
  if (!/^[0-9a-f-]{36}$/.test(next.data?.id || ''))
    throw new Error('RETENTION_LIFECYCLE_ACCOUNT_RESULT');
  const id = next.data.id;
  const removed = await client.auth.admin.deleteUser(id, false);
  if (removed.error && removed.error.status !== 404)
    throw new Error('RETENTION_LIFECYCLE_ACCOUNT_DELETE');
  const confirmed = await client.rpc('disposal_account_work', { p_action: 'completed', p_id: id });
  if (confirmed.error || confirmed.data?.completed !== true)
    throw new Error('RETENTION_LIFECYCLE_ACCOUNT_CONFIRM');
  return 'removed';
}
