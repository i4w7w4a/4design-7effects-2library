// @vitest-environment jsdom
import { act, StrictMode, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test } from 'vitest';
import { MagneticCards } from './MagneticCards';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  document.body.replaceChildren();
});

test('StrictMode mounts, updates, and cleans up real magnetic behavior while preserving the link', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const reactRoot = createRoot(host);

  function view(depthPx: number) {
    return (
      <StrictMode>
        <MagneticCards options={{ depthPx }}>
          <a href="/contact" data-magnetic-card>
            <span data-magnetic-visual style={{ '--magnetic-depth': '9px' } as CSSProperties}>
              Contact
            </span>
          </a>
        </MagneticCards>
      </StrictMode>
    );
  }

  await act(async () => { reactRoot.render(view(36)); });
  const card = host.querySelector<HTMLAnchorElement>('[data-magnetic-card]')!;
  const visual = host.querySelector<HTMLElement>('[data-magnetic-visual]')!;
  expect(card.tagName).toBe('A');
  expect(card.getAttribute('href')).toBe('/contact');
  expect(visual.style.getPropertyValue('--magnetic-depth')).toBe('36px');

  await act(async () => { reactRoot.render(view(64)); });
  expect(visual.style.getPropertyValue('--magnetic-depth')).toBe('64px');

  await act(async () => { reactRoot.unmount(); });
  expect(visual.style.getPropertyValue('--magnetic-depth')).toBe('9px');
});
