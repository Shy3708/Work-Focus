import type { TaskStatus, WorkCategory } from '../../shared/types';

export function StatusOrb({
  status,
  category,
  size = 'default',
}: {
  status: TaskStatus;
  category?: WorkCategory;
  size?: 'default' | 'compact';
}) {
  const active = status === 'active';
  return (
    <span
      className={`status-orb status-orb--${size} ${active ? 'is-active' : ''} ${category === 'life' ? 'cat-life' : ''}`}
      aria-hidden="true"
    >
      <span className="orb-layer orb-off" />
      <span className="orb-layer orb-on" />
    </span>
  );
}
