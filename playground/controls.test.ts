import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createControls } from './controls';
import type { DemoOptions } from './options';

function mount(onSave?: (options: DemoOptions) => Promise<string>) {
  const dom = new JSDOM('<div id="panel"></div>');
  const root = dom.window.document.querySelector('#panel') as HTMLElement;
  const changes: Array<Record<string, number | boolean>> = [];
  const panel = createControls(root, {
    onChange(options) { changes.push({ ...options }); },
    onSave: onSave ?? (async () => '.local/sessions/sample.json'),
  });
  return { dom, root, changes, panel };
}

describe('playground controls', () => {
  it('sends a complete live option set when a slider changes', () => {
    const { dom, root, changes, panel } = mount();
    const slider = root.querySelector<HTMLInputElement>('[name="tiltDeg"]')!;
    slider.value = '20';
    slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    expect(panel.getOptions().tiltDeg).toBe(20);
    expect(changes.at(-1)).toMatchObject({ tiltDeg: 20, radius: 215, reducedMotion: false });
    expect(root.querySelector('[data-value="tiltDeg"]')?.textContent).toContain('20');
  });

  it('applies the deep preset, then restores defaults with reset', () => {
    const { root, panel } = mount();
    root.querySelector<HTMLButtonElement>('[data-preset="deep"]')!.click();
    expect(panel.getOptions().depthPx).toBeGreaterThan(36);
    expect(root.querySelector('[data-preset="deep"]')?.getAttribute('aria-pressed')).toBe('true');

    root.querySelector<HTMLButtonElement>('[data-action="reset"]')!.click();
    expect(panel.getOptions()).toMatchObject({ depthPx: 36, tiltDeg: 13, reducedMotion: false });
    expect(root.querySelector('[data-preset="deep"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('simulates reduced motion and switches the preview to phone width', () => {
    const { root, panel } = mount();
    const reduced = root.querySelector<HTMLInputElement>('[name="reducedMotion"]')!;
    reduced.click();
    expect(panel.getOptions().reducedMotion).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-viewport="phone"]')!.click();
    expect(panel.getViewport()).toBe('phone');
    expect(root.querySelector('[data-viewport="phone"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the saved local path after an explicit save', async () => {
    const { root } = mount();
    root.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector('[data-save-status]')?.textContent).toContain('.local/sessions/sample.json');
  });

  it('does not claim newly edited settings were saved by an earlier pending request', async () => {
    let completeSave!: (path: string) => void;
    const pendingSave = new Promise<string>((resolve) => { completeSave = resolve; });
    const { dom, root } = mount(() => pendingSave);
    root.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    const slider = root.querySelector<HTMLInputElement>('[name="depthPx"]')!;
    slider.value = '64';
    slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    completeSave('.local/sessions/old-settings.json');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelector('[data-save-status]')?.textContent).not.toContain('old-settings.json');
  });

  it('removes the saved claim after subsequent edits', async () => {
    const { dom, root } = mount();
    root.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector('[data-save-status]')?.textContent).toContain('.local/sessions/sample.json');

    const slider = root.querySelector<HTMLInputElement>('[name="tiltDeg"]')!;
    slider.value = '18';
    slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(root.querySelector('[data-save-status]')?.textContent).not.toContain('.local/sessions/sample.json');
  });
});
