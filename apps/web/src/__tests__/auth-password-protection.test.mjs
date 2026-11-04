import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { authPasswordProtectionApi } from '../../../../scripts/lib/auth-password-protection.mjs';
const projectId = 'ckrkfylsyihwouvesypm';
const reply = (enabled) =>
  new Response(
    JSON.stringify({
      password_hibp_enabled: enabled,
      smtp_pass: 'PRIVATE_PROVIDER_SENTINEL',
      external_secret: 'PRIVATE_PROVIDER_SENTINEL',
    }),
    { status: 200 },
  );
function apiWith(fetchImpl) {
  return authPasswordProtectionApi({ projectId, token: 'test-only-token', fetchImpl });
}

describe('protected leaked-password Auth configuration', () => {
  it('reads only the boolean and does not expose unrelated secret fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(false));
    expect(await apiWith(fetchImpl).read()).toBe(false);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `https://api.supabase.com/v1/projects/${projectId}/config/auth`,
    );
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error' });
  });
  it('patches exactly one setting and verifies a fresh read', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply(false))
      .mockResolvedValueOnce(reply(true))
      .mockResolvedValueOnce(reply(true));
    const onAttempt = vi.fn();
    const result = await apiWith(fetchImpl).enable(false, onAttempt);
    expect(result).toEqual({ before: false, after: true, changed: true });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PROVIDER_SENTINEL');
    expect(fetchImpl.mock.calls.map(([, options]) => options.method)).toEqual([
      'GET',
      'PATCH',
      'GET',
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ password_hibp_enabled: true });
    expect(onAttempt).toHaveBeenCalledOnce();
  });
  it('does not patch an already enabled or changed baseline', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => reply(true));
    expect(await apiWith(fetchImpl).enable(true)).toEqual({
      before: true,
      after: true,
      changed: false,
    });
    expect(fetchImpl.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    fetchImpl.mockClear();
    await expect(apiWith(fetchImpl).enable(false)).rejects.toThrow('BASELINE_CHANGED');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('fails on a missing setting, denied access and unsuccessful verification', async () => {
    await expect(apiWith(vi.fn().mockResolvedValue(new Response('{}'))).read()).rejects.toThrow(
      'FLAG_MISSING',
    );
    await expect(
      apiWith(
        vi.fn().mockResolvedValue(new Response('PRIVATE_PROVIDER_SENTINEL', { status: 403 })),
      ).read(),
    ).rejects.toThrow('HTTP_403');
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply(false))
      .mockResolvedValueOnce(reply(true))
      .mockResolvedValueOnce(reply(false));
    await expect(apiWith(fetchImpl).enable(false)).rejects.toThrow('VERIFICATION');
  });
  it('rejects another project, missing credentials and redirects/network failures', async () => {
    expect(() => authPasswordProtectionApi({ projectId: 'other', token: 'test-only' })).toThrow(
      'TARGET_OR_ACCESS',
    );
    expect(() => authPasswordProtectionApi({ projectId, token: '' })).toThrow('TARGET_OR_ACCESS');
    await expect(
      apiWith(vi.fn().mockRejectedValue(new Error('sensitive network detail'))).read(),
    ).rejects.toThrow('AUTH_SECURITY_NETWORK');
  });
  it('retains before-state before mutation and requires the protected reviewed main workflow', async () => {
    const root = path.resolve('../..');
    const workflow = await fs.readFile(
      path.join(root, '.github/workflows/release-auth-password-protection.yml'),
      'utf8',
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('group: production-release');
    expect(workflow).toContain('validate-security-install.yml');
    expect(workflow.indexOf('Retain before-state before changing Auth')).toBeLessThan(
      workflow.indexOf('Enable only leaked-password protection'),
    );
    const script = path.join(root, 'scripts/release-auth-password-protection.mjs');
    const result = spawnSync(process.execPath, [script, 'enable'], {
      cwd: root,
      env: { ...process.env, GITHUB_ACTIONS: 'false' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('AUTH_SECURITY_ERROR');
  });
});
