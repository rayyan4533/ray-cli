export type Provider = "anthropic";

export type ModelInfo = {
  id: string;
  provider: Provider;
  note: string;
};

export const MODELS = [
  {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    note: "fastest and cheapest, good for routine work",
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    note: "balanced speed, cost and quality",
  },
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    note: "strongest reasoning, highest cost per turn",
  },
] as const satisfies readonly ModelInfo[];

export type ModelId = (typeof MODELS)[number]["id"];

export const MODEL_IDS: ModelId[] = MODELS.map((m) => m.id);

export const DEFAULT_MODEL: ModelId = "claude-haiku-5-5";

export function parseModelId(value: string): ModelId | null {
  return MODEL_IDS.find((id) => id === value) ?? null;
}

export function getModelInfo(id: ModelId): ModelInfo {
  return MODELS.find((m) => m.id === id)!;
}
