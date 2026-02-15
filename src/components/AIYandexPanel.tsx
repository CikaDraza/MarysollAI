import { BoltIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import React, { useState } from "react";

interface Props {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  refetch: () => void;
  error?: unknown;
  showStats: boolean;
  setShowStats: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function AIYandexPanel({
  onSubmit,
  refetch,
  isLoading,
  error,
  showStats,
  setShowStats,
}: Props) {
  const [input, setInput] = useState("");

  async function handleSubmit() {
    if (!input.trim()) return;
    onSubmit(input);
    setInput("");
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="absolute overflow-hidden bottom-0 left-0 right-0 w-full">
      <div className="bg-white/5 backdrop-blur">
        <div className="sm:px-2">
          <div className="relative isolate overflow-visible bg-purple-50/50 backdrop-blur-lg px-0 py-2.5 sm:rounded-md lg:flex lg:gap-x-20">
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-[max(-7rem,calc(50%-52rem))] -z-10 -translate-y-1/2 transform-gpu blur-2xl"
            >
              <div
                style={{
                  clipPath:
                    "polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)",
                }}
                className="aspect-577/310 w-144.25 bg-linear-to-r from-[#ff80b5] to-[#9089fc] opacity-30"
              />
            </div>
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-[max(45rem,calc(50%+8rem))] -z-10 -translate-y-1/2 transform-gpu blur-2xl"
            >
              <div
                style={{
                  clipPath:
                    "polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)",
                }}
                className="aspect-577/310 w-144.25 bg-linear-to-r from-[#ff80b5] to-[#9089fc] opacity-30"
              />
            </div>
            <div className="mx-auto text-center w-full p-1.5">
              <div className="flex flex-col md:flex-row items-center justify-center gap-x-6">
                <textarea
                  id="message"
                  name="message"
                  rows={2}
                  className="block w-full rounded-md bg-gray-100 px-3.5 py-2 text-base text-gray-800 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-purple-600"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button
                  onClick={() => setShowStats(!showStats)}
                  className={`cursor-pointer p-2 rounded-full hover:text-[#BA34B7] transition-colors ${showStats ? "text-[#BA34B7] bg-pink-50" : "text-gray-400"}`}
                >
                  <BoltIcon className="size-5" />
                </button>

                {error instanceof Error ? (
                  <button
                    onClick={refetch}
                    disabled={isLoading || !input.trim()}
                    className="cursor-pointer flex items-center w-full md:w-auto mt-3 md:mt-0 justify-center min-w-30 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-100 disabled:bg-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4 text-gray-900"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Slanje...
                      </span>
                    ) : (
                      "Refetch"
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={isLoading || !input.trim()}
                    className="cursor-pointer flex items-center w-full md:w-auto mt-3 md:mt-0 justify-center rounded-full bg-white p-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-100 disabled:bg-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4 text-gray-900"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Analiziram...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <PaperAirplaneIcon className="size-4 -rotate-45" />
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
