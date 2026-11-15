import { readFileSync } from "node:fs";
import { noticeToken as computeNoticeToken } from "../convex/keiki/notice";
import { Effect, Schema } from "effect";
import { AgentKit, defineTool } from "@onkeiki/agents";
import type { ToolPolicy } from "@onkeiki/agents";

export const AGENT_ID = process.env.KEIKI_AGENT_ID ?? "44277a5e-b81d-4bb6-92d2-6c9c0eec47b3";
export const IM_FREE = process.env.KEIKI_IM_FREE === "1" || process.env.KEIKI_IM_FREE === "true";
export const TOOLS_BASE_URL = (process.env.FROLIC_TOOLS_BASE_URL ?? process.env.SHARED_CONVEX_SITE_URL ?? "").replace(/\/$/, "");
export const DEDICATED_LINE = ["1", "true"].includes((process.env.KEIKI_DEDICATED_LINE ?? "").trim().toLowerCase());

const basePrompt = readFileSync(new URL("../docs/keiki-system-prompt.md", import.meta.url), "utf8").trim();
const noticeToken = process.env.KEIKI_API_KEY ? computeNoticeToken(process.env.KEIKI_API_KEY) : "unset";
const addendum = readFileSync(new URL("./prompt-addendum.md", import.meta.url), "utf8").trim().replace("{{NOTICE_TOKEN}}", noticeToken);
const groupAddendum = readFileSync(new URL("./prompt-group.md", import.meta.url), "utf8").trim();
const systemPrompt = DEDICATED_LINE ? basePrompt + "\n\n" + addendum + "\n\n" + groupAddendum : basePrompt + "\n\n" + addendum;

const depositPolicy = {
  approval: "ask",
  approvalFallback: "tool",
  preflight: true,
  card: {
    v: 1,
    blocks: [
      { kind: "header", title: "Hold your spot" },
      { kind: "fields", fields: [{ label: "Deposit", value: "Comes back when you arrive" }] },
      { kind: "note", text: "Paid through Whop. No-shows feed the crew's Frolic Fund." },
    ],
    theme: { approveLabel: "Hold it", declineLabel: "Not now" },
  },
} as unknown as ToolPolicy;

const depositDescription = DEDICATED_LINE
  ? "Get the Whop checkout link for the commitment deposit. Asks for a Face ID approval first."
  : "Get the Whop checkout link for the commitment deposit. Send them that link as one text and say plainly what it is.";

function webhook<A, I>(name: string, description: string, input: Schema.Schema<A, I>, policy?: ToolPolicy) {
  return defineTool({
    name,
    description,
    input,
    ...(policy ? { policy } : {}),
    execute: (args: A, ctx) =>
      Effect.promise(async () => {
        const res = await fetch(TOOLS_BASE_URL + "/keiki/tools/" + name, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Orchid-Api-Key": process.env.KEIKI_API_KEY ?? "" },
          body: JSON.stringify({ input: args, context: { phone: ctx.phone } }),
        });
        return await res.json();
      }),
  });
}

const none = Schema.Struct({});

export const tools = [
  webhook("get_member", "Who this person is: name, crew, friends, paused, and what Frolic remembers about them. Call at the start of every conversation.", none),
  webhook("join_crew", "Add this person to a crew from an invite code. Ask their first name first.", Schema.Struct({ invite_code: Schema.String, first_name: Schema.String })),
  webhook("get_today", "Today's plan and this person's own answer. In a group chat it returns only the plan.", none),
  webhook("tap_down", "Record a secret I'm down for today's plan.", none),
  webhook("tap_only_if", "Record a secret only if: names (up to 3 friends) and/or after (a time like 7:30). Read the names back first.", Schema.Struct({ names: Schema.optional(Schema.Array(Schema.String)), after: Schema.optional(Schema.String) })),
  webhook("tap_pass", "They're out today. Never ask why.", none),
  webhook("get_reveal", "After the reveal: who matched and the meet-up details. Before it, says not yet.", none),
  webhook("on_my_way", "Share their ETA in minutes with the matched group.", Schema.Struct({ minutes: Schema.Number })),
  webhook("check_in", "Mark them arrived. Pass attachment_id when they share their location, or lat and lng if known.", Schema.Struct({ attachment_id: Schema.optional(Schema.String), lat: Schema.optional(Schema.Number), lng: Schema.optional(Schema.Number) })),
  webhook("submit_snap", "Add the photo they just sent (its attachment_id) to the group snap.", Schema.Struct({ attachment_id: Schema.String })),
  webhook("pay_deposit", depositDescription, none, DEDICATED_LINE ? depositPolicy : undefined),
  webhook("remember", "Save a preference they state to their memory.", Schema.Struct({ text: Schema.String })),
  ...(IM_FREE
    ? [webhook("im_free", "They are free now and want a plan started today. Never say in a group or to anyone else that they started it.", Schema.Struct({ for_minutes: Schema.optional(Schema.Number) }))]
    : []),
  webhook("pause", "Stop or restart Frolic texts. paused defaults to true.", Schema.Struct({ paused: Schema.optional(Schema.Boolean) })),
  ...(DEDICATED_LINE
    ? [webhook("link_group_chat", "In a group chat only: connect this chat to a crew with its invite code, so the drop and the reveal post here.", Schema.Struct({ invite_code: Schema.String }))]
    : []),
];

export const kit = AgentKit.create({
  apiKey: process.env.KEIKI_API_KEY ?? "",
  name: "Frolic",
  resolveNumber: () => Effect.succeed(""),
  agent: {
    model: "google/gemini-3.8-flash",
    reasoningEffort: "low",
    maxSteps: 10,
    historyLimit: 16,
    systemPrompt: () => systemPrompt,
    tools,
    memory: { enabled: true, provider: "supermemory", autoRetrieve: true, categories: ["preference", "context"] },
    sandbox: { enabled: true, persistent: false, maxExecTime: "1 minute" },
    steering: { debounceWindow: "2 seconds", midTurnStrategy: "interrupt", maxBatch: 5 },
    media: { image: { action: "describe" }, audio: { action: "transcribe" }, fallback: "[Attachment]" },
    mcp: { enabled: true },
    guards: true,
    promptGuard: true,
  },
} as never);
