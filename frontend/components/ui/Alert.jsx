import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const ICONS = {
  error: AlertTriangle,
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
};

export default function Alert({ tone = 'info', title, children, action }) {
  const Icon = ICONS[tone];
  return (
    <div
      className={`alert alert--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon size={18} aria-hidden="true" className="alert__icon" />
      <div className="alert__body">
        {title && <p className="alert__title">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}
