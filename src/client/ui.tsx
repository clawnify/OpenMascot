// The handful of pieces every screen repeats. Small on purpose: the design
// system lives in styles.css, and a component library on top of four screens
// would be more code than the screens.

import type { ReactNode } from "react";

export function Card({ title, hint, children, action }: { title?: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card p-5">
      {(title || action) && (
        <header className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="mt-0.5 block text-sm text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputClass =
  "w-full rounded-md bg-surface px-3 py-2 text-sm shadow-[inset_0_0_0_1px_var(--border)] focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--ring)]";

export const primaryClass =
  "rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50";

export const quietClass =
  "rounded-md px-3 py-2 text-sm font-medium text-muted shadow-[inset_0_0_0_1px_var(--border)] hover:text-foreground disabled:opacity-50";

export function Pill({ tone, children }: { tone: "accent" | "success" | "warning" | "muted"; children: ReactNode }) {
  const tones = {
    accent: "bg-accent-tint text-accent-text",
    success: "bg-success-tint text-success",
    warning: "bg-warning-tint text-warning",
    muted: "bg-sunken text-muted",
  } as const;
  return <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg bg-sunken px-5 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{hint}</p>
    </div>
  );
}

/**
 * Confirmation for something that cannot be undone.
 *
 * Exists because the browser's own confirm() cannot name what is about to be
 * destroyed in a way anyone reads, and because a native dialog is the one piece
 * of this app that would not follow the design system.
 */
export function Confirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="presentation" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="card w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1.5 text-sm text-muted">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={quietClass} onClick={onCancel} autoFocus>
            Keep it
          </button>
          <button
            type="button"
            className="rounded-md bg-danger px-3.5 py-2 text-sm font-medium text-on-primary hover:opacity-90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
