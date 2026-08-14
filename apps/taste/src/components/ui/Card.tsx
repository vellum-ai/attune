import { forwardRef } from "preact/compat";
import type { ComponentChildren, JSX } from "preact";

export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children?: ComponentChildren;
  elevated?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { class: className, children, elevated = false, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      data-slot="card"
      data-elevated={elevated ? "true" : "false"}
      class={`ui-card${elevated ? " ui-card-elevated" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
});
