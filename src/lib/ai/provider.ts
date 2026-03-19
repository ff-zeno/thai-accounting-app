import { createOpenRouter } from "@openrouter/ai-sdk-provider";

let _provider: ReturnType<typeof createOpenRouter> | null = null;

export function getOpenRouterProvider() {
  if (!_provider) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }
    _provider = createOpenRouter({ apiKey });
  }
  return _provider;
}
