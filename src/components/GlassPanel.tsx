import type { ReactNode } from 'react';

export function GlassPanel({ children }: { children: ReactNode }) {
  return <div className="glass-panel">{children}</div>;
}
