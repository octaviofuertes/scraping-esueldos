import { env } from '../../config/env';

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: unknown;
}

interface GenerateGeminiInput {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
}

interface GenerateGeminiContentInput {
  system: string;
  parts: GeminiPart[];
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: 'application/json' | 'text/plain';
  model?: string;
}

export class GeminiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiUnavailableError';
  }
}

export function isGeminiConfigured() {
  return Boolean(env.geminiApiKey);
}

export async function generateGeminiContent(input: GenerateGeminiContentInput) {
  if (!env.geminiApiKey) {
    throw new GeminiUnavailableError('GEMINI_API_KEY no configurada');
  }
  const model = input.model ?? env.geminiModel;
  const generationConfig: Record<string, unknown> = {
    temperature: input.temperature ?? 0.2,
    topP: 0.9,
    maxOutputTokens: input.maxOutputTokens ?? 900,
  };
  if (input.responseMimeType) generationConfig.responseMimeType = input.responseMimeType;
  if (model.includes('2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: 'user', parts: input.parts }],
      generationConfig,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new GeminiUnavailableError(`Gemini respondió ${response.status} con ${model}: ${detail.slice(0, 240)}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  if (!text) {
    const finishReason = payload.candidates?.[0]?.finishReason;
    throw new GeminiUnavailableError(`Gemini no devolvió texto utilizable${finishReason ? ` (${finishReason})` : ''}`);
  }
  return text;
}

export async function generateGeminiText(input: GenerateGeminiInput) {
  return generateGeminiContent({
    system: input.system,
    parts: [{ text: input.prompt }],
    temperature: input.temperature,
    maxOutputTokens: input.maxOutputTokens,
    model: input.model,
  });
}
