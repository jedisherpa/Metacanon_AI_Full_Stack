import type { ReactNode } from 'react';

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field__label">{props.label}</span>
      <div className="field__control">{props.children}</div>
      {props.hint ? <span className="field__hint">{props.hint}</span> : null}
    </label>
  );
}

export function Button(props: {
  children: ReactNode;
  type?: 'button' | 'submit';
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
}) {
  const variant = props.variant ?? 'primary';
  return (
    <button
      className={`btn btn--${variant}`}
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}
