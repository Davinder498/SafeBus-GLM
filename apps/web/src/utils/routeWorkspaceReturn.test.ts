import { describe, expect, it } from 'vitest';
import { safeRouteWorkspaceReturn } from '@/utils/routeWorkspaceReturn';

describe('route workspace creation return', () => {
  const origin = 'https://safebus.kids';
  const route = '/admin/routes/00000000-0000-4000-8000-000000000123';
  it('accepts only a scoped, same-origin route attachment return', () => {
    expect(safeRouteWorkspaceReturn(route + '#route-service', origin)).toBe(route + '#route-service');
    expect(safeRouteWorkspaceReturn(route + '?service=service-forward#route-service', origin))
      .toBe(route + '?service=service-forward#route-service');
    expect(safeRouteWorkspaceReturn('https://safebus.kids' + route + '#route-service', origin))
      .toBe(route + '#route-service');
  });
  it('rejects external or unrecognized return destinations', () => {
    for (const target of [
      'https://attacker.example' + route + '#route-service',
      '//attacker.example' + route + '#route-service',
      '/admin/buses/00000000-0000-4000-8000-000000000123?tab=drivers',
      '/admin/routes/new#route-service',
      route + '#route-details',
      route + '?next=https://attacker.example#route-service',
      route + '?service=valid&service=duplicate#route-service',
      route + '?service=%2Fadmin%2Fusers#route-service',
    ]) {
      expect(safeRouteWorkspaceReturn(target, origin)).toBeNull();
    }
  });
});
