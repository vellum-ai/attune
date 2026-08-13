import { publishEvent, type HookFunction, type PostToolUseContext, type ToolUseContent } from "@vellumai/plugin-api";

const TAG = "taste:profile";

const postToolUse: HookFunction<PostToolUseContext> = async (ctx) => {
  if (ctx.toolResponse.is_error) return;
  const invocation = ctx.messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.content)
    .find((block): block is ToolUseContent => block.type === "tool_use" && block.id === ctx.toolResponse.tool_use_id);
  if (!invocation) return;

  const innerTool = invocation.name === "skill_execute" ? invocation.input.tool : invocation.name;
  if (innerTool !== "update_profile") return;

  await publishEvent({
    id: crypto.randomUUID(),
    emittedAt: new Date().toISOString(),
    message: { type: "sync_changed", tags: [TAG] } as never,
  }).catch(() => undefined);
};

export default postToolUse;
