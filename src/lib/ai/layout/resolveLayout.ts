import { blockHasRequiredMetadata, getBlockEntry } from "@/lib/ai/block-registry";
import { canRenderBlockOnSurface, getBlockRegistryEntry } from "@/lib/ai/layout/block-registry";
import type { BaseBlock } from "@/types/landing-block";
import type { LayoutIntent, LayoutSurface, ResolvedLayout } from "./layout-types";

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function logResolve(label: "[LAYOUT_RESOLVE]" | "[LAYOUT_SKIP]", details: Record<string, unknown>): void {
  if (!isDev()) return;
  console.debug(label, details);
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== "object") return String(value ?? "");
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${key}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join("|");
}

function stableKey(intent: LayoutIntent, surface: LayoutSurface): string {
  const metadata = intent.metadata ?? {};
  const identity =
    intent.type === "AppointmentCalendarBlock"
      ? {
          type: intent.type,
          surface: intent.surface ?? surface,
          salonId: metadata.salonId,
          serviceId: metadata.serviceId,
          serviceName: metadata.serviceName ?? metadata.service,
          date: metadata.date,
          timeWindowStart: metadata.timeWindowStart,
          timeWindowEnd: metadata.timeWindowEnd,
        }
      : intent.type === "SalonListBlock"
        ? {
            type: intent.type,
            surface: intent.surface ?? surface,
            city: metadata.city,
            service: metadata.serviceName ?? metadata.service,
            category: metadata.category,
          }
        : intent.type === "CityListBlock"
          ? {
              type: intent.type,
              surface: intent.surface ?? surface,
              service: metadata.serviceName ?? metadata.service,
              category: metadata.category,
            }
          : {
    type: intent.type,
    surface: intent.surface ?? surface,
    salonId: metadata.salonId,
    serviceId: metadata.serviceId,
    appointmentId: metadata.appointmentId,
    mode: metadata.mode,
          };
  return stableStringify(identity);
}

function toBlock(intent: LayoutIntent, index: number, surface: LayoutSurface): BaseBlock {
  const entry = getBlockEntry(intent.type);
  const metadata = { ...(intent.metadata ?? {}) };
  const legacyBlock =
    metadata.__legacyBlock && typeof metadata.__legacyBlock === "object"
      ? (metadata.__legacyBlock as Record<string, unknown>)
      : {};
  delete metadata.__legacyBlock;
  return {
    ...legacyBlock,
    id: intent.id ?? `layout-${surface}-${intent.type}-${index}`,
    type: intent.type,
    priority: intent.priority ?? entry?.priority ?? 1,
    metadata: {
      serviceId: "",
      serviceName: "",
      variantName: "",
      ...metadata,
    } as BaseBlock["metadata"],
    query: intent.query,
  };
}

export function resolveLayout(
  intents: LayoutIntent[],
  opts: { surface?: LayoutSurface } = {},
): ResolvedLayout {
  const surface = opts.surface ?? "workspace";
  const sorted = [...intents].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const seen = new Set<string>();
  const blocks: BaseBlock[] = [];
  const skipped: ResolvedLayout["skipped"] = [];

  sorted.forEach((intent, index) => {
    const registryEntry = getBlockRegistryEntry(intent.type);
    if (!registryEntry || !canRenderBlockOnSurface(intent.type, intent.surface ?? surface)) {
      skipped.push({ type: String(intent.type), reason: "unsupported" });
      logResolve("[LAYOUT_SKIP]", {
        type: String(intent.type),
        reason: "unsupported",
        kind: registryEntry?.kind,
        surface: intent.surface ?? surface,
      });
      return;
    }

    const key = stableKey(intent, surface);
    if (seen.has(key)) {
      skipped.push({ type: intent.type, reason: "duplicate" });
      logResolve("[LAYOUT_SKIP]", {
        type: intent.type,
        reason: "duplicate",
        kind: registryEntry.kind,
      });
      return;
    }
    seen.add(key);

    const block = toBlock(intent, index, surface);
    if (!blockHasRequiredMetadata(block)) {
      skipped.push({
        type: intent.type,
        reason: "invalid",
        metadata: (block.metadata ?? {}) as Record<string, unknown>,
      });
      logResolve("[LAYOUT_SKIP]", {
        type: intent.type,
        reason: "invalid",
        kind: registryEntry.kind,
      });
      return;
    }

    blocks.push(block);
  });

  logResolve("[LAYOUT_RESOLVE]", {
    inputCount: intents.length,
    blockCount: blocks.length,
    skippedCount: skipped.length,
    surface,
    kinds: blocks.map((block) => getBlockRegistryEntry(block.type)?.kind ?? "unknown"),
  });

  return { blocks, skipped };
}
