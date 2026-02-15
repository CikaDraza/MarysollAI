// useYandexGPT.ts
import { callYandexGPT } from "@/services/callYandex";
import { useQuery } from "@tanstack/react-query";

export interface YandexGPTResponse {
  result: {
    alternatives: Array<{
      message: {
        role: string;
        text: string;
      };
      status: string;
    }>;
    usage: {
      inputTextTokens: string;
      completionTokens: string;
      totalTokens: string;
    };
  };
}

export const useYandexGPT = (prompt: string) => {
  return useQuery<YandexGPTResponse>({
    queryKey: ["yandex-gpt", prompt],
    queryFn: () => callYandexGPT(prompt),
    enabled: !!prompt,
    refetchOnWindowFocus: false,
    staleTime: 60000,
  });
};
