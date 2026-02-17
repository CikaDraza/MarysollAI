// types/ai/deepseek/usage.ts
export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelVersion?: string;
  completionTokensDetails?: {
    reasoningTokens: number;
  };
}

export interface DeepSeekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens: number;
  };
}
