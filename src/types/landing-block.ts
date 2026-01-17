// src/types/landing-block.ts

import { BlockTypes } from "./block-types";

export interface BaseBlock {
  id: string;
  type: BlockTypes;
  priority: number;
}
