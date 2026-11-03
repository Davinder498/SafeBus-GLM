import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { DropdownItem, DropdownMenu } from './DropdownMenu';
import { Field } from './Field';
import { Input } from './Input';
import { Select } from './Select';
import { Textarea } from './Textarea';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(
    () => [{ width: 100, height: 40 }] as unknown as DOMRectList,
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}

describe('shared field accessibility', () => {
  it('associates input error and hint descriptions without losing required semantics', async () => {
    await render(
      <Field label="School authority" htmlFor="authority" error="Enter a name." hint="Business name" required>
        <Input id="authority" />
      </Field>,
    );
    const input = container.querySelector<HTMLInputElement>('#authority')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-required')).toBe('true');
    const ids = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'Business name',
      'Enter a name.',
    ]);
    expect(container.querySelector('label')?.htmlFor).toBe('authority');
  });

  it('connects select and textarea errors to their own controls', async () => {
    await render(
      <>
        <Field label="Topic" htmlFor="topic" error="Choose a topic.">
          <Select id="topic"><option value="">Choose</option></Select>
        </Field>
        <Field label="Message" htmlFor="message" error="Enter a message.">
          <Textarea id="message" />
        </Field>
      </>,
    );
    for (const id of ['topic', 'message']) {
      const element = container.querySelector<HTMLSelectElement | HTMLTextAreaElement>(`#${id}`)!;
      expect(element.getAttribute('aria-invalid')).toBe('true');
      const describedBy = element.getAttribute('aria-describedby')!;
      expect(document.getElementById(describedBy)?.textContent).toMatch(/Choose a topic|Enter a message/);
    }
  });
});

describe('shared dialog and menu keyboard behavior', () => {
  it('moves focus into the confirmation and restores the opening control on close', async () => {
    const onCancel = vi.fn();
    const dialog = (open: boolean) => (
      <>
        <button type="button" id="launch">Open confirmation</button>
        <ConfirmDialog
          open={open}
          title="Remove assignment?"
          description="This action needs confirmation."
          onCancel={onCancel}
          onConfirm={vi.fn()}
        />
      </>
    );
    await render(dialog(false));
    const launch = container.querySelector<HTMLButtonElement>('#launch')!;
    launch.focus();
    await render(dialog(true));
    const panel = container.querySelector('[role="dialog"]')!;
    const cancel = Array.from(panel.querySelectorAll('button')).find((button) => button.textContent === 'Cancel')!;
    expect(document.activeElement).toBe(cancel);
    await act(async () => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(onCancel).toHaveBeenCalledOnce();
    await render(dialog(false));
    expect(document.activeElement).toBe(launch);
  });

  it('supports arrow navigation, Home/End and Escape in the account menu', async () => {
    await render(
      <DropdownMenu trigger="Account">
        <DropdownItem onClick={vi.fn()}>Settings</DropdownItem>
        <DropdownItem onClick={vi.fn()}>Sign out</DropdownItem>
      </DropdownMenu>,
    );
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    await act(async () => trigger.click());
    const menu = container.querySelector<HTMLElement>('[role="menu"]')!;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(document.activeElement).toBe(items[0]);
    await act(async () => items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(items[1]);
    await act(async () => items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(items[0]);
    await act(async () => items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(trigger);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});
