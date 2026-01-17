// src/components/layout/blockFactory.tsx
import { LoginBlock } from "../blocks/LoginBlock";
import { BaseBlock } from "@/types/landing-block";
// ostali blokovi...

export function blockFactory(block: BaseBlock) {
  switch (block.type) {
    case "LoginBlock":
      return <LoginBlock key={block.id} block={block} />;
    default:
      return null;
  }
}
