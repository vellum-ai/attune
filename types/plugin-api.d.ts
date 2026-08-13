declare module "@vellumai/plugin-api" {
  export interface ToolUseContent {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, any>;
  }

  export interface PostToolUseContext {
    toolResponse: { is_error?: boolean; tool_use_id?: string };
    messages: ReadonlyArray<{ role: string; content: ReadonlyArray<any> }>;
  }

  export type HookFunction<T> = (context: T) => void | Promise<void>;
  export function publishEvent(event: Record<string, any>): Promise<unknown>;
}
