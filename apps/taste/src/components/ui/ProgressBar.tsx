import type { JSX } from "preact";

export interface ProgressBarProps extends JSX.HTMLAttributes<HTMLDivElement> {
  value: number;
  label: string;
}

export function ProgressBar({ value, label, class: className, ...props }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      {...props}
      data-slot="progress-bar"
      class={`ui-progress${className ? ` ${className}` : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-valuetext={label}
    >
      <span data-slot="progress-bar-fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}
