import { TextMessage } from "@/types/ai/ai.text-engine";
import clsx from "clsx";

export default function TextBlock({ block }: { block: TextMessage }) {
  return (
    <p
      className={clsx(
        "max-w-full mt-1 text-sm/6 p-2 rounded-xl text-gray-700 md:col-span-2 sm:mt-0",
        block.role === "user"
          ? "w-sm ml-auto bg-(--secondary-color) text-white"
          : "mr-auto",
      )}
    >
      {block.content}
    </p>
  );
}
