import { Loader2 } from 'lucide-react';

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon: Icon,
  children,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 size={16} className="spin" aria-hidden="true" />
      ) : (
        Icon && <Icon size={16} aria-hidden="true" />
      )}
      {children && <span>{children}</span>}
    </button>
  );
}
