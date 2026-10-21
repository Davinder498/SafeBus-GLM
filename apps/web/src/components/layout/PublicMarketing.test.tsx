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
  it('keeps only contact and privacy in the footer and sign-in in the header', async () => {
    const container = await render(<PublicLayout>Content</PublicLayout>);
    const header = container.querySelector('header');
    const headerText = header?.textContent ?? '';

    expect(headerText).not.toContain('Contact');
    expect(headerText).toContain('Sign in');
    expect(container.querySelector('footer a[href="/contact"]')?.textContent).toBe('Contact');
    expect(container.querySelector('footer a[href="/privacy"]')?.textContent).toBe('Privacy');
    expect(container.querySelectorAll('footer a')).toHaveLength(2);
    expect(container.querySelector('footer')?.textContent).toContain('SafeBus');
    expect(container.querySelector('footer')?.textContent).not.toContain('Track the bus');
    expect(headerText).not.toContain('Parents');
    expect(headerText).not.toContain('Drivers');
    expect(headerText).not.toContain('Admins');
    expect(headerText).not.toContain('Demo');
  });

  it('keeps the consultation action and replaces the pilot and credibility content', async () => {
    const container = await render(<LandingPage />);
    const links = Array.from(container.querySelectorAll('a'));
    const requestLink = links.find((link) => link.textContent?.includes('Request a consultation'));

    expect(requestLink?.getAttribute('href')).toBe('/contact');
    expect(container.querySelector('#pilot')).toBeNull();
    const whyChooseUs = container.querySelector('#why-choose-us');
    expect(whyChooseUs?.querySelector('h2')?.textContent?.trim()).toBe('Why choose us');
    expect(whyChooseUs?.querySelectorAll('article')).toHaveLength(5);
    expect(container.textContent).not.toContain('Track the bus, not the child');
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
