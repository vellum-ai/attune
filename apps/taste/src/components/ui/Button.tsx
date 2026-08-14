import type { ComponentChildren, JSX } from "preact";

type ButtonAttributes = JSX.HTMLAttributes<HTMLButtonElement> & {
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
};

export type ButtonVariant = "primary" | "outlined" | "ghost";

export interface ButtonProps extends ButtonAttributes {
  variant?: ButtonVariant;
  children?: ComponentChildren;
}

export function Button({ variant = "primary", class: className, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      data-slot="button"
      data-variant={variant}
      class={`ui-button ui-button-${variant}${className ? ` ${className}` : ""}`}
    >
      {children}
    </button>
  );
}
