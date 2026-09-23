import { useEffect, useRef, type ReactNode } from 'react';
import { DEFAULT_OPTIONS, mountMagneticCards, type MagneticOptions } from '../../effects/magnetic-cards/src/magneticCards';

export type MagneticCardsProps = {
  children: ReactNode;
  options?: Partial<MagneticOptions>;
  className?: string;
};

export function MagneticCards({ children, options, className }: MagneticCardsProps) {
  const root = useRef<HTMLDivElement>(null);
  const motion = useRef<ReturnType<typeof mountMagneticCards> | null>(null);

  useEffect(() => {
    if (!root.current) return;
    const instance = mountMagneticCards(root.current, { ...DEFAULT_OPTIONS, ...options });
    motion.current = instance;
    return () => {
      instance.destroy();
      if (motion.current === instance) motion.current = null;
    };
  }, []);

  useEffect(() => {
    motion.current?.updateOptions({ ...DEFAULT_OPTIONS, ...options });
  }, [
    options?.radius,
    options?.travel,
    options?.responseMs,
    options?.tiltDeg,
    options?.depthPx,
    options?.perspectivePx,
    options?.glow,
    options?.reducedMotion,
  ]);

  return <div ref={root} className={className}>{children}</div>;
}
