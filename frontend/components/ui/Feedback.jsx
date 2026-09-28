import { Loader2 } from 'lucide-react';

export function Spinner({ label = 'Loading', size = 20 }) {
  return (
    <span className="spinner" role="status">
      <Loader2 size={size} className="spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function FullPageLoader({ label = 'Loading ValueCraft Mail' }) {
  return (
    <div className="full-page-center">
      <Spinner label={label} size={28} />
    </div>
  );
}

export function Skeleton({ width = '100%', height = 14, className = '' }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty-state">
      {Icon && (
        <span className="empty-state__icon">
          <Icon size={28} aria-hidden="true" />
        </span>
      )}
      <h2 className="empty-state__title">{title}</h2>
      {children && <div className="empty-state__text">{children}</div>}
      {action}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
