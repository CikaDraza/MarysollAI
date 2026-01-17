// src/components/blocks/LoginBlock.tsx

import { BaseBlock } from "@/types/landing-block";

interface LoginBlockProps {
  block: BaseBlock;
}

export function LoginBlock({ block }: LoginBlockProps) {
  return (
    <div className="border p-4 rounded">
      <strong>LoginBlock</strong>
      <p>Placeholder – forma za prijavu</p>
    </div>
  );
}
