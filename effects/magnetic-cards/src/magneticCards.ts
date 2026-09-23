export type MagneticOptions = {
  radius: number;
  travel: number;
  responseMs: number;
  tiltDeg: number;
  depthPx: number;
  perspectivePx: number;
  glow: number;
  reducedMotion: boolean;
};

export const DEFAULT_OPTIONS: MagneticOptions = {
  radius: 215,
  travel: 20,
  responseMs: 150,
  tiltDeg: 13,
  depthPx: 36,
  perspectivePx: 680,
  glow: 0.65,
  reducedMotion: false,
};

const OPTION_LIMITS = {
  radius: [80, 420],
  travel: [0, 48],
  responseMs: [70, 500],
  tiltDeg: [0, 24],
  depthPx: [0, 80],
  perspectivePx: [350, 1400],
  glow: [0, 1],
} as const;
const OPTION_KEYS = new Set([...Object.keys(OPTION_LIMITS), 'reducedMotion']);

function validateOptions(next: Partial<MagneticOptions>): void {
  for (const key of Object.keys(next)) {
    if (!OPTION_KEYS.has(key)) throw new TypeError(`Unknown magnetic option: ${key}.`);
  }
  for (const key of Object.keys(OPTION_LIMITS) as (keyof typeof OPTION_LIMITS)[]) {
    const value = next[key];
    if (value === undefined) continue;
    const [min, max] = OPTION_LIMITS[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new RangeError(`${key} must be a finite number from ${min} to ${max}.`);
    }
  }
  if (next.reducedMotion !== undefined && typeof next.reducedMotion !== 'boolean') {
    throw new TypeError('reducedMotion must be a boolean.');
  }
}

type Card = {
  outer: HTMLElement;
  visual: HTMLElement;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  originalTransform: string;
  originalDepth: { value: string; priority: string };
  originalGlowStrength: { value: string; priority: string };
  x: number;
  y: number;
  z: number;
  rotateX: number;
  rotateY: number;
};

function savedProperty(style: CSSStyleDeclaration, name: string): { value: string; priority: string } {
  return { value: style.getPropertyValue(name), priority: style.getPropertyPriority(name) };
}

function restoreProperty(style: CSSStyleDeclaration, name: string, saved: { value: string; priority: string }): void {
  if (saved.value) style.setProperty(name, saved.value, saved.priority);
  else style.removeProperty(name);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mountMagneticCards(root: HTMLElement, initial: Partial<MagneticOptions> = {}) {
  validateOptions(initial);
  let options = { ...DEFAULT_OPTIONS, ...initial };
  const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let mediaReduced = mediaQuery?.matches ?? false;
  const previousReducedAttribute = root.getAttribute('data-magnetic-reduced-motion');
  const cards: Card[] = Array.from(root.querySelectorAll<HTMLElement>('[data-magnetic-card]'))
    .flatMap((outer) => {
      const visual = outer.querySelector<HTMLElement>('[data-magnetic-visual]');
      if (!visual) return [];
      return [{
        outer, visual, centerX: 0, centerY: 0, width: 0, height: 0,
        originalTransform: visual.style.transform,
        originalDepth: savedProperty(visual.style, '--magnetic-depth'),
        originalGlowStrength: savedProperty(visual.style, '--magnetic-glow-strength'),
        x: 0, y: 0, z: 0, rotateX: 0, rotateY: 0,
      }];
    });
  const lifecycle = new AbortController();
  let pointer: { x: number; y: number } | undefined;
  let frameId = 0;
  let lastFrame = 0;
  let destroyed = false;

  function reduced(): boolean {
    return options.reducedMotion || mediaReduced;
  }

  function clearMotion(): void {
    pointer = undefined;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    lastFrame = 0;
    for (const card of cards) {
      card.x = card.y = card.z = card.rotateX = card.rotateY = 0;
      card.visual.style.transform = card.originalTransform;
    }
  }

  function syncReducedAttribute(): void {
    if (reduced()) root.setAttribute('data-magnetic-reduced-motion', '');
    else if (previousReducedAttribute === null) root.removeAttribute('data-magnetic-reduced-motion');
    else root.setAttribute('data-magnetic-reduced-motion', previousReducedAttribute);
  }

  function applyLayerOptions(): void {
    for (const card of cards) {
      card.visual.style.setProperty('--magnetic-depth', `${options.depthPx}px`);
      card.visual.style.setProperty('--magnetic-glow-strength', String(options.glow));
    }
  }

  function measure(): void {
    for (const card of cards) {
      const rect = card.outer.getBoundingClientRect();
      card.centerX = rect.left + rect.width / 2;
      card.centerY = rect.top + rect.height / 2;
      card.width = rect.width;
      card.height = rect.height;
    }
  }

  function onGeometryChange(): void {
    if (destroyed) return;
    measure();
    wake();
  }

  function wake(): void {
    if (destroyed || frameId || document.hidden || reduced()) return;
    frameId = requestAnimationFrame(frame);
  }

  function frame(timestamp: number): void {
    frameId = 0;
    if (destroyed || document.hidden || reduced()) return;
    const delta = lastFrame ? clamp(timestamp - lastFrame, 1, 48) : 16;
    lastFrame = timestamp;
    const follow = 1 - Math.exp(-delta / options.responseMs);
    let moving = false;

    for (const card of cards) {
      const dx = pointer ? pointer.x - card.centerX : 0;
      const dy = pointer ? pointer.y - card.centerY : 0;
      const distance = pointer ? Math.hypot(dx, dy) : Infinity;
      const near = card.width > 0 && card.height > 0 && distance < options.radius;
      const closeness = near ? 1 - distance / options.radius : 0;
      const pull = closeness * closeness * (3 - 2 * closeness);
      const travel = near && distance > 0 ? options.travel * pull * Math.min(distance / 16, 1) / distance : 0;
      const targets = {
        x: dx * travel,
        y: dy * travel,
        z: options.depthPx * pull,
        rotateX: near ? -clamp(dy / (card.height / 2), -1, 1) * options.tiltDeg * pull : 0,
        rotateY: near ? clamp(dx / (card.width / 2), -1, 1) * options.tiltDeg * pull : 0,
      };

      card.x += (targets.x - card.x) * follow;
      card.y += (targets.y - card.y) * follow;
      card.z += (targets.z - card.z) * follow;
      card.rotateX += (targets.rotateX - card.rotateX) * follow;
      card.rotateY += (targets.rotateY - card.rotateY) * follow;
      const unsettled = Math.abs(targets.x - card.x) > .03
        || Math.abs(targets.y - card.y) > .03
        || Math.abs(targets.z - card.z) > .03
        || Math.abs(targets.rotateX - card.rotateX) > .02
        || Math.abs(targets.rotateY - card.rotateY) > .02;
      moving ||= unsettled;

      if (!unsettled) {
        card.x = targets.x;
        card.y = targets.y;
        card.z = targets.z;
        card.rotateX = targets.rotateX;
        card.rotateY = targets.rotateY;
      }

      if (!near && !unsettled) {
        card.visual.style.transform = card.originalTransform;
      } else {
        const baseTransform = card.originalTransform === 'none' ? '' : card.originalTransform;
        card.visual.style.transform = `perspective(${options.perspectivePx}px) translate3d(${card.x.toFixed(2)}px, ${card.y.toFixed(2)}px, ${card.z.toFixed(2)}px) rotateX(${card.rotateX.toFixed(2)}deg) rotateY(${card.rotateY.toFixed(2)}deg) ${baseTransform}`.trim();
      }
    }

    if (moving) wake();
    else lastFrame = 0;
  }

  function onPointerMove(event: PointerEvent): void {
    if (reduced() || document.hidden) return;
    const focused = document.activeElement;
    if (focused?.matches(':focus-visible') && cards.some((card) => card.outer.contains(focused))) return;
    if (event.pointerType === 'touch') {
      onPointerLeave();
      return;
    }
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    pointer = { x: event.clientX, y: event.clientY };
    wake();
  }

  function onPointerLeave(): void {
    pointer = undefined;
    wake();
  }

  function onMediaChange(event: MediaQueryListEvent): void {
    mediaReduced = event.matches;
    syncReducedAttribute();
    if (reduced()) clearMotion();
  }

  function onVisibilityChange(): void {
    if (document.hidden) clearMotion();
  }

  function onFocusIn(event: FocusEvent): void {
    if (event.target instanceof Element && event.target.closest('[data-magnetic-card]')) {
      onPointerLeave();
    }
  }

  measure();
  applyLayerOptions();
  syncReducedAttribute();
  mediaQuery?.addEventListener('change', onMediaChange);
  const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(onGeometryChange);
  for (const card of cards) resizeObserver?.observe(card.outer);
  window.addEventListener('pointermove', onPointerMove, { signal: lifecycle.signal, passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerLeave, { signal: lifecycle.signal });
  window.addEventListener('blur', onPointerLeave, { signal: lifecycle.signal });
  window.addEventListener('resize', onGeometryChange, { signal: lifecycle.signal, passive: true });
  window.addEventListener('scroll', onGeometryChange, { signal: lifecycle.signal, passive: true, capture: true });
  document.addEventListener('visibilitychange', onVisibilityChange, { signal: lifecycle.signal });
  root.addEventListener('focusin', onFocusIn, { signal: lifecycle.signal });

  return {
    updateOptions(next: Partial<MagneticOptions>) {
      if (destroyed) return;
      validateOptions(next);
      options = { ...options, ...next };
      applyLayerOptions();
      syncReducedAttribute();
      if (reduced()) clearMotion();
      else wake();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      lifecycle.abort();
      mediaQuery?.removeEventListener('change', onMediaChange);
      resizeObserver?.disconnect();
      clearMotion();
      for (const card of cards) {
        restoreProperty(card.visual.style, '--magnetic-depth', card.originalDepth);
        restoreProperty(card.visual.style, '--magnetic-glow-strength', card.originalGlowStrength);
      }
      if (previousReducedAttribute === null) root.removeAttribute('data-magnetic-reduced-motion');
      else root.setAttribute('data-magnetic-reduced-motion', previousReducedAttribute);
    },
  };
}
