// Small, dependency-free UI primitives shared across every page.
// Tailwind-only. Keep these generic so pages stay consistent.

import { useEffect } from 'react';
import { IconInbox } from './icons';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/* ----------------------------------------------------------------- Card */
export function Card({ className, hover = false, children, ...rest }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-slate-200/80 bg-white shadow-card',
        hover && 'transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={cx('p-5', className)}>{children}</div>;
}

/* --------------------------------------------------------------- Button */
export function Button({ variant = 'primary', size = 'md', className, disabled, children, ...rest }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
  };
  const variants = {
    primary: 'bg-brand-800 text-white shadow-brand-glow hover:bg-brand-700',
    secondary: 'bg-white text-slate-700 border border-slate-300/90 shadow-sm hover:bg-slate-50 hover:border-slate-400',
    danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
    success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
  };
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- Inputs */
export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full rounded-lg border border-slate-300/90 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10';

export function Input({ className, ...rest }) {
  return <input className={cx(inputBase, className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return (
    <select className={cx(inputBase, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

/* ---------------------------------------------------------------- Badge */
export function Badge({ tone = 'slate', children, className }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 ring-slate-500/10',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    red: 'bg-red-50 text-red-700 ring-red-600/20',
    blue: 'bg-brand-50 text-brand-700 ring-brand-600/20',
    gray: 'bg-slate-100 text-slate-500 ring-slate-500/10',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------ StatCard */
export function StatCard({ label, value, sub, tone = 'slate', icon }) {
  const tones = {
    slate: { value: 'text-slate-900', chip: 'bg-slate-100 text-slate-500' },
    green: { value: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15' },
    amber: { value: 'text-amber-600', chip: 'bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-600/15' },
    red: { value: 'text-red-600', chip: 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-600/15' },
    blue: { value: 'text-brand-700', chip: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15' },
  };
  const t = tones[tone] || tones.slate;
  return (
    <Card hover className="animate-fade-in-up">
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className={cx('mt-2 text-3xl font-bold tracking-tight tabular-nums', t.value)}>{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        {icon && (
          <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', t.chip)}>
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- States */
export function Spinner({ className }) {
  return (
    <svg
      className={cx('h-5 w-5 animate-spin text-brand-600', className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', hint, icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-inset ring-slate-200">
        <span className="[&>svg]:h-7 [&>svg]:w-7">{icon || <IconInbox className="h-7 w-7" />}</span>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- Header */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.7rem] font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- Modal */
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cx('relative w-full rounded-2xl bg-white shadow-xl', width)}>
        {title && (
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
