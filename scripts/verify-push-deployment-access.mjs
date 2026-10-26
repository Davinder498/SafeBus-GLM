#!/usr/bin/env node
// Fail before schema changes if CI's deployment token is expired or mis-scoped.
try {
  if (
    process.env.SUPABASE_PROJECT_ID !== 'ckrkfylsyihwouvesypm' ||
    !process.env.SUPABASE_ACCESS_TOKEN
  )
    throw new Error('Invalid configuration.');
  const response = await fetch('https://api.supabase.com/v1/projects', {
    headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (
    !response.ok ||
    !(await response.json()).some((project) => project.id === process.env.SUPABASE_PROJECT_ID)
  )
    throw new Error('Access denied.');
  console.log('PASS: Supabase deployment credential can access BusSafe.');
} catch {
  console.error(
    'Supabase deployment credential is invalid or cannot access BusSafe. Renew the production SUPABASE_ACCESS_TOKEN secret; do not use a frontend API key.',
  );
  process.exitCode = 1;
}
