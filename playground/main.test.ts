// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';

test('restores magnetic controls after returning from the browser back-forward cache', async () => {
  vi.resetModules();
  window.history.replaceState({}, '', '?effect=magnetic-cards');
  document.body.innerHTML = `
    <div id="unsupported"></div>
    <div id="app">
      <div id="preview-frame"></div>
      <div id="magnetic-demo">
        <button data-magnetic-card><span data-magnetic-visual></span></button>
      </div>
      <div id="control-panel"></div>
      <div id="card-feedback"></div>
    </div>`;
  await import('./main');
  const visual = document.querySelector<HTMLElement>('[data-magnetic-visual]')!;
  const depth = document.querySelector<HTMLInputElement>('[name="depthPx"]')!;
  depth.value = '64';
  depth.dispatchEvent(new Event('input', { bubbles: true }));
  expect(visual.style.getPropertyValue('--magnetic-depth')).toBe('64px');

  window.dispatchEvent(new Event('pagehide'));
  expect(visual.style.getPropertyValue('--magnetic-depth')).toBe('');
  const restored = new Event('pageshow');
  Object.defineProperty(restored, 'persisted', { value: true });
  window.dispatchEvent(restored);
  expect(visual.style.getPropertyValue('--magnetic-depth')).toBe('64px');

  depth.value = '70';
  depth.dispatchEvent(new Event('input', { bubbles: true }));
  expect(visual.style.getPropertyValue('--magnetic-depth')).toBe('70px');
  window.dispatchEvent(new Event('pagehide'));
});
