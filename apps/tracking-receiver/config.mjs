const projects = new Map([
  ['recovery', 'deladookciebwvqojhkv'],
  ['production', 'ckrkfylsyihwouvesypm'],
]);

export function receiverConfig(env) {
  const project = projects.get(env.SAFEBUS_RECEIVER_TARGET ?? 'recovery');
  const url = env.SAFEBUS_RECEIVER_SUPABASE_URL;
  const key = env.SAFEBUS_RECEIVER_PUBLISHABLE_KEY;
  if (!project || url !== `https://${project}.supabase.co` || !key?.startsWith('sb_publishable_')) {
    throw new Error('Invalid receiver auth configuration');
  }
  const port = Number(env.SAFEBUS_RECEIVER_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid receiver port');
  const database = new URL(env.SAFEBUS_RECEIVER_DATABASE_URL);
  const role = 'safebus_gps_receiver';
  const direct = database.hostname === `db.${project}.supabase.co` && database.username === role;
  const pooled = database.hostname.endsWith('.pooler.supabase.com') && database.username === `${role}.${project}`;
  if (!(direct || pooled) || !['postgresql:', 'postgres:'].includes(database.protocol) ||
      database.search || database.hash || !database.password || !['', '/', '/postgres'].includes(database.pathname)) {
    throw new Error('Invalid receiver database configuration');
  }
  return {url, key, port, connectionString: database.href};
}
