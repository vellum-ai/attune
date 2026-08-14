import type { ComponentChildren } from "preact";

export interface ChoiceGroupProps {
  labelledBy: string;
  children: ComponentChildren;
}

export function ChoiceGroup({ labelledBy, children }: ChoiceGroupProps) {
  return (
    <div class="choice-pair" data-slot="choice-group" role="radiogroup" aria-labelledby={labelledBy}>
      {children}
    </div>
  );
}
