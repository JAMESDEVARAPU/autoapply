import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export function createLovableAiGatewayRunIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  let resolveRunId: (value: string | undefined) => void = () => {};
  let runIdResolved = false;
  const runIdReady = new Promise<string | undefined>((resolve) => {
    resolveRunId = resolve;
  });

  const publishRunId = (value?: string) => {
    const nextRunId = value?.trim() || undefined;
    if (!runId && nextRunId) runId = nextRunId;
    if (!runIdResolved) {
      runIdResolved = true;
      resolveRunId(runId);
    }
  };
  if (runId) publishRunId(runId);

  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) {
        headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
      }
      try {
        const response = await fetch(input, { ...init, headers });
        publishRunId(response.headers.get(LOVABLE_AIG_RUN_ID_HEADER) ?? undefined);
        return response;
      } catch (error) {
        publishRunId(undefined);
        throw error;
      }
    },
    getRunId: () => runId,
    waitForRunId: () => (runId ? Promise.resolve(runId) : runIdReady),
  };
}

export function createLovableAiGatewayProvider(lovableApiKey: string, initialRunId?: string) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);

  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    supportsStructuredOutputs: false,
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch as typeof fetch,
  });

  return Object.assign(provider, {
    getRunId: runIdFetch.getRunId,
    waitForRunId: runIdFetch.waitForRunId,
  });
}

/** Non-OpenAI model on the chat path — no Responses API needed. */
export const AGENT_MODEL = "google/gemini-3.8-flash";

export function getAgentModel() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project (missing gateway key).");
  return createLovableAiGatewayProvider(key)(AGENT_MODEL);
}

export function describeGatewayError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/402/.test(message)) {
    return "The workspace is out of AI credits. Add credits to continue using the agent.";
  }
  if (/429/.test(message)) {
    return "The AI service is rate limited right now. Try again in a moment.";
  }
  if (/40[13]/.test(message)) {
    return "AI access is blocked for this workspace. Check the workspace AI settings.";
  }
  return message;
}

/**
 * Robust JSON generation through the gateway.
 * Gemini on the chat path returns reasoning text alongside JSON and sometimes
 * wraps it in code fences, which breaks the AI SDK's strict object output.
 * We ask for a JSON object explicitly and salvage the first JSON value found.
 */
export async function generateJson<T>(args: {
  system: string;
  prompt: string;
  parse: (value: unknown) => T;
}): Promise<T> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project (missing gateway key).");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Lovable-API-Key": key,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: AGENT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${args.system}\nReply with a single JSON object only, no prose and no code fences.` },
        { role: "user", content: args.prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(describeGatewayError(new Error(`${response.status} ${await response.text()}`)));
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  const cleaned = content.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.search(/[{[]/);
  const candidate = start >= 0 ? cleaned.slice(start) : cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    const lastBrace = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (lastBrace <= 0) throw new Error("The AI response could not be read. Please try again.");
    parsed = JSON.parse(candidate.slice(0, lastBrace + 1));
  }
  return args.parse(parsed);
}
