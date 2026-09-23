// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mountMagneticCards } from '../src/magneticCards';

let pending = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;
let mediaMatches = false;
let mediaListeners = new Set<(event: MediaQueryListEvent) => void>();

function setMediaReducedMotion(matches: boolean): void {
  mediaMatches = matches;
  for (const listener of mediaListeners) {
    listener({ matches, media: '(prefers-reduced-motion: reduce)' } as MediaQueryListEvent);
  }
}

function flushFrames(count: number, start = 16): void {
  for (let frame = 0; frame < count; frame += 1) {
    const callbacks = [...pending.values()];
    pending.clear();
    for (const callback of callbacks) callback(start + frame * 16);
  }
}

function pointer(x: number, y: number, pointerType = 'mouse'): void {
  const event = new MouseEvent('pointermove', { clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  window.dispatchEvent(event);
}

function createCard(): { root: HTMLElement; card: HTMLAnchorElement; visual: HTMLElement } {
  const root = document.createElement('div');
  root.innerHTML = '<a href="/contact" data-magnetic-card class="magnetic-card"><span data-magnetic-visual class="magnetic-visual"><span class="magnetic-content">Contact</span></span></a>';
  document.body.append(root);
  const card = root.querySelector<HTMLAnchorElement>('[data-magnetic-card]')!;
  const visual = root.querySelector<HTMLElement>('[data-magnetic-visual]')!;
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
    x: 100, y: 100, left: 100, top: 100, width: 200, height: 160,
    right: 300, bottom: 260, toJSON: () => ({}),
  });
  return { root, card, visual };
}

beforeEach(() => {
  pending = new Map();
  nextFrameId = 0;
  mediaMatches = false;
  mediaListeners = new Set();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++nextFrameId, callback);
    return nextFrameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { pending.delete(id); });
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return mediaMatches; },
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { mediaListeners.add(listener); },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { mediaListeners.delete(listener); },
  }));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('pulls the inner visual toward a nearby mouse, then settles without keeping an animation loop alive', () => {
  const { root, card, visual } = createCard();
  const motion = mountMagneticCards(root);

  expect(pending.size).toBe(0);
  pointer(245, 180);
  flushFrames(24);

  const translation = visual.style.transform.match(/translate3d\(([\d.-]+)px,\s*([\d.-]+)px/);
  expect(translation).not.toBeNull();
  expect(Number(translation![1])).toBeGreaterThan(5);
  expect(card.style.transform).toBe('');

  pointer(800, 800);
  flushFrames(100, 400);
  expect(visual.style.transform).toBe('');
  expect(pending.size).toBe(0);
  motion.destroy();
});

test('stays still for reduced motion and clears an active transform when the preference changes', () => {
  const { root, visual } = createCard();
  setMediaReducedMotion(true);
  const motion = mountMagneticCards(root);

  pointer(245, 180);
  flushFrames(20);
  expect(visual.style.transform).toBe('');
  expect(pending.size).toBe(0);

  setMediaReducedMotion(false);
  pointer(245, 180);
  flushFrames(20);
  expect(visual.style.transform).toContain('translate3d(');

  setMediaReducedMotion(true);
  expect(visual.style.transform).toBe('');
  expect(pending.size).toBe(0);
  motion.destroy();
});

test('updates visible depth and glow settings, then restores the host styles on destroy', () => {
  const { root, visual } = createCard();
  visual.style.setProperty('--magnetic-depth', '9px');
  visual.style.setProperty('--magnetic-glow-strength', '0.8');
  const motion = mountMagneticCards(root);

  expect(visual.style.getPropertyValue('--magnetic-depth')).toBe('36px');
  expect(visual.style.getPropertyValue('--magnetic-glow-strength')).toBe('0.65');

  motion.updateOptions({ depthPx: 64, glow: 0.25 });
  expect(visual.style.getPropertyValue('--magnetic-depth')).toBe('64px');
  expect(visual.style.getPropertyValue('--magnetic-glow-strength')).toBe('0.25');

  motion.destroy();
  expect(visual.style.getPropertyValue('--magnetic-depth')).toBe('9px');
  expect(visual.style.getPropertyValue('--magnetic-glow-strength')).toBe('0.8');
});

test('touch movement stops mouse magnetism instead of carrying an old mouse position', () => {
  const { root, visual } = createCard();
  const motion = mountMagneticCards(root);
  pointer(245, 180);
  flushFrames(12);
  expect(visual.style.transform).toContain('translate3d(');

  pointer(245, 180, 'touch');
  flushFrames(100, 240);
  expect(visual.style.transform).toBe('');
  expect(pending.size).toBe(0);
  motion.destroy();
});

test('suspends movement when the document becomes hidden and resumes only after new input', () => {
  const { root, visual } = createCard();
  const motion = mountMagneticCards(root);
  pointer(245, 180);
  flushFrames(12);
  expect(visual.style.transform).toContain('translate3d(');

  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(visual.style.transform).toBe('');
  expect(pending.size).toBe(0);
  pointer(245, 180);
  expect(pending.size).toBe(0);

  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(pending.size).toBe(0);
  pointer(245, 180);
  flushFrames(12, 240);
  expect(visual.style.transform).toContain('translate3d(');
  motion.destroy();
});

test('remeasures card geometry after a container resize without a window resize', () => {
  let notifyResize = () => {};
  let observing = false;
  vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      notifyResize = () => callback([], this);
    }
    observe() { observing = true; }
    unobserve() {}
    disconnect() { observing = false; }
  });
  const { root, card, visual } = createCard();
  const motion = mountMagneticCards(root);
  pointer(245, 180);
  flushFrames(20);
  expect(visual.style.transform).toContain('translate3d(');

  vi.mocked(card.getBoundingClientRect).mockReturnValue({
    x: 400, y: 100, left: 400, top: 100, width: 200, height: 160,
    right: 600, bottom: 260, toJSON: () => ({}),
  });
  notifyResize();
  pointer(245, 180);
  flushFrames(100, 400);
  expect(visual.style.transform).toBe('');
  motion.destroy();
  expect(observing).toBe(false);
});

test('rejects invalid live settings without poisoning the current animation', () => {
  const { root, visual } = createCard();
  const motion = mountMagneticCards(root);
  expect(() => motion.updateOptions({ responseMs: Number.NaN })).toThrow(RangeError);
  expect(() => motion.updateOptions({ depthPx: -1 })).toThrow(RangeError);

  pointer(245, 180);
  flushFrames(20);
  expect(visual.style.transform).toContain('translate3d(');
  expect(visual.style.transform).not.toContain('NaN');
  motion.destroy();
});

test('rejects unknown live setting keys instead of silently accepting a typo', () => {
  const { root } = createCard();
  const motion = mountMagneticCards(root);
  expect(() => motion.updateOptions({ radus: 250 } as Parameters<typeof motion.updateOptions>[0])).toThrow(TypeError);
  motion.destroy();
});

test('rejects unknown initial setting keys before creating an active controller', () => {
  const { root } = createCard();
  let motion: ReturnType<typeof mountMagneticCards> | undefined;
  try {
    expect(() => {
      motion = mountMagneticCards(root, { radus: 250 } as Parameters<typeof mountMagneticCards>[1]);
    }).toThrow(TypeError);
  } finally {
    motion?.destroy();
  }
});

test('settles the visual when keyboard focus enters a card so the focus ring stays aligned', () => {
  const { root, card, visual } = createCard();
  const motion = mountMagneticCards(root);
  pointer(245, 180);
  flushFrames(20);
  expect(visual.style.transform).toContain('translate3d(');

  card.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  flushFrames(100, 400);
  expect(visual.style.transform).toBe('');
  motion.destroy();
});

test('keeps a focused card still through later pointer moves and resumes after blur', () => {
  const { root, card, visual } = createCard();
  const motion = mountMagneticCards(root);
  pointer(245, 180);
  flushFrames(20);
  expect(visual.style.transform).toContain('translate3d(');

  card.focus();
  flushFrames(100, 400);
  expect(visual.style.transform).toBe('');

  pointer(245, 180);
  flushFrames(20, 2100);
  expect(visual.style.transform).toBe('');

  card.blur();
  pointer(245, 180);
  flushFrames(20, 2500);
  expect(visual.style.transform).toContain('translate3d(');
  motion.destroy();
});

test('keeps an existing none transform from invalidating the magnetic transform list', () => {
  const { root, visual } = createCard();
  visual.style.transform = 'none';
  const motion = mountMagneticCards(root);
  pointer(245, 180);
  flushFrames(12);
  expect(visual.style.transform).toContain('translate3d(');
  expect(visual.style.transform).not.toMatch(/\snone$/);
  motion.destroy();
  expect(visual.style.transform).toBe('none');
});
