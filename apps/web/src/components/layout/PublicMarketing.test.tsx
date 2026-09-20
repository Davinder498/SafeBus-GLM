import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicLayout } from './PublicLayout';
import { LandingPage } from '@/pages/LandingPage';
import { ContactPage } from '@/pages/ContactPage';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

async function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<MemoryRouter>{node}</MemoryRouter>);
  });
  return container;
}

describe('public marketing navigation', () => {
  it('offers contact and administrator sign-in without role or demo links', async () => {
    const container = await render(<PublicLayout>Content</PublicLayout>);
    const header = container.querySelector('header');
    const headerText = header?.textContent ?? '';

    expect(headerText).toContain('Contact');
    expect(headerText).toContain('Sign in');
    expect(headerText).not.toContain('Parents');
    expect(headerText).not.toContain('Drivers');
    expect(headerText).not.toContain('Admins');
    expect(headerText).not.toContain('Demo');
  });

  it('routes every commercial landing-page action to contact', async () => {
    const container = await render(<LandingPage />);
    const links = Array.from(container.querySelectorAll('a'));
    const requestLink = links.find((link) => link.textContent?.includes('Request a consultation'));
    const pilotLink = links.find((link) => link.textContent?.includes('Discuss a pilot'));

    expect(requestLink?.getAttribute('href')).toBe('/contact');
    expect(pilotLink?.getAttribute('href')).toBe('/contact');
    expect(container.textContent).not.toContain('Open demo');
    expect(container.textContent).not.toContain('View demo portals');
  });

  it('renders the public inquiry form and sensitive-information warning', async () => {
    const container = await render(<ContactPage />);
    expect(container.querySelector('form')).not.toBeNull();
    expect(container.querySelector('#inquiry-email')).not.toBeNull();
    expect(container.querySelector('#inquiry-topic')).not.toBeNull();
    expect(container.textContent).toContain('Do not include student names');
  });
});
