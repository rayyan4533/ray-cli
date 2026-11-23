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

// "optimized" lets ray-cli pick: cheapest model first, stronger ones when needed.
export const OPTIMIZED = "optimized" as const;
export type ModelChoice = ModelId | typeof OPTIMIZED;
export const DEFAULT_CHOICE: ModelChoice = OPTIMIZED;
export const MODEL_CHOICES: ModelChoice[] = [OPTIMIZED, ...MODEL_IDS];

export function parseModelChoice(value: string): ModelChoice | null {
  return value === OPTIMIZED ? OPTIMIZED : parseModelId(value);
}

// Find a model by its full id or by a unique part of it: "sonnet" -> "claude-sonnet-5-5".
// No nicknames are stored, so this keeps working when other providers are added.
export function findModel(word: string): ModelId | null {
  const exact = parseModelId(word);
  if (exact) return exact;
  const matches = MODEL_IDS.filter((id) => id.includes(word.toLowerCase()));
  return matches.length === 1 ? matches[0]! : null;
}

export function choiceLabel(choice: ModelChoice): string {
  return choice === OPTIMIZED ? "⚡ optimized" : choice;
}

export function getModelInfo(id: ModelId): ModelInfo {
  return MODELS.find((m) => m.id === id)!;
}
