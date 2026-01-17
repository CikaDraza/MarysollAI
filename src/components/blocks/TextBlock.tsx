import { TextMessage } from "@/types/ai/ai.text-engine";
import { StreamingText } from "../motion/StreamingText";

export default function TextBlock({ block }: { block: TextMessage }) {
  return (
    <p className="mt-1 text-sm/6 text-gray-700 sm:col-span-2 sm:mt-0">
      <StreamingText text={block.content} />
    </p>
  );
}
