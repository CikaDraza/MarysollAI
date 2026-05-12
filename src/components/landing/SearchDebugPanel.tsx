// src/components/landing/SearchDebugPanel.tsx
//
// Phase 2.5D Task 5 — Search debug panel (DEV ONLY).
//
// Floating bottom-right collapsible panel. Renders nothing in production
// (NODE_ENV === "production"). Becomes the single observability surface for
// ranking issues — shows geo source, fallback level, score distributions,
// diversity deferrals, cache hit/miss inferred from React Query state.
"use client";

import { useState } from "react";
import { useCityContext } from "@/context/landing/CityContext";
import { useSearchContext } from "@/context/landing/SearchContext";
import {
  rankSearchResults,
  type RankedSlot,
} from "@/lib/search/rankSearchResults";
import {
  resolveFallbackPolicy,
  applyFallbackPolicy,
  evaluateFallbackPolicy,
} from "@/lib/availability/fallbackPolicy";

const isProd = process.env.NODE_ENV === "production";

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

export default function SearchDebugPanel() {
  const [open, setOpen] = useState(false);
  const { cityName, geoResolved } = useCityContext();
  const { results, fallbackLevel, isLoading } = useSearchContext();

  // Hide entirely in production — never ship debug UI.
  if (isProd) return null;

  // Compute a snapshot ranking so the panel shows what consumers actually see.
  // Deliberately cheap: we just take results as-is and feed through the
  // adapter to capture rankingMeta. Reuses the same code path as real consumers.
  const debugPolicy = resolveFallbackPolicy("quickaccess", { kind: "implicit_geo" });
  const policyPassed = applyFallbackPolicy(results, debugPolicy);
  const policyRejected = results.length - policyPassed.length;
  const policyDecisions = results.map((slot) => ({
    slot,
    decision: evaluateFallbackPolicy(slot, debugPolicy),
  }));

  const ranked = rankSearchResults({
    slots: policyPassed,
    strategy: "quickaccess",
    userLocation:
      geoResolved.lat != null && geoResolved.lng != null
        ? { lat: geoResolved.lat, lng: geoResolved.lng }
        : undefined,
    fallbackLevel,
    geoSource: geoResolved.source,
  });

  const top3 = ranked.slots.slice(0, 3);
  const diversityDeferred = ranked.slots.filter(
    (s: RankedSlot) => s.rankingMeta.diversityApplied,
  ).length;

  // Origin breakdown across all results
  const originCounts = results.reduce(
    (acc, r) => {
      const origins = r.slotOrigins ?? [];
      if (origins.includes("synthetic")) acc.synthetic++;
      else if (origins.includes("nearby_city") && origins.includes("related_service")) {
        acc.nearby_city++;
        acc.related_service++;
      } else if (origins.includes("nearby_city")) acc.nearby_city++;
      else if (origins.includes("related_service")) acc.related_service++;
      else if (origins.includes("relaxed_time")) acc.relaxed_time++;
      else if (origins.includes("real")) acc.real++;
      return acc;
    },
    { real: 0, relaxed_time: 0, related_service: 0, nearby_city: 0, synthetic: 0 },
  );

  // Availability confidence breakdown
  const confCounts = results.reduce(
    (acc, r) => {
      const c = r.availabilityConfidence ?? "unknown";
      if (c === "calendar_verified") acc.calendar_verified++;
      else if (c === "working_hours_only") acc.working_hours_only++;
      else if (c === "synthetic_projection") acc.synthetic_projection++;
      return acc;
    },
    { calendar_verified: 0, working_hours_only: 0, synthetic_projection: 0 },
  );

  const policyCounts = policyDecisions.reduce(
    (acc, item) => {
      const conf = item.slot.availabilityConfidence;
      if (item.decision.accepted && conf === "calendar_verified") acc.accepted_verified++;
      else if (item.decision.accepted && conf === "working_hours_only") acc.accepted_working_hours++;
      else if (!item.decision.accepted && conf === "synthetic_projection") acc.rejected_synthetic++;
      else if (!item.decision.accepted && item.decision.reason === "invalid_confidence") acc.rejected_invalid++;
      return acc;
    },
    {
      accepted_verified: 0,
      accepted_working_hours: 0,
      rejected_synthetic: 0,
      rejected_invalid: 0,
    },
  );

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        fontFamily: "monospace",
        fontSize: 11,
        background: "rgba(15, 15, 20, 0.92)",
        color: "#e6e6f0",
        border: "1px solid rgba(168, 85, 247, 0.35)",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
        maxWidth: 340,
        backdropFilter: "blur(6px)",
        pointerEvents: "auto",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "8px 12px",
          background: "transparent",
          color: "inherit",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 11,
          fontWeight: 700,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>[SEARCH DEBUG]</span>
        <span style={{ opacity: 0.6 }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid rgba(168, 85, 247, 0.25)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <StatRow label="city" value={cityName || "—"} />
          <StatRow label="geo source" value={geoResolved.source} />
          <StatRow
            label="geo lat/lng"
            value={
              geoResolved.lat != null && geoResolved.lng != null
                ? `${geoResolved.lat.toFixed(3)}, ${geoResolved.lng.toFixed(3)}`
                : "—"
            }
          />
          <StatRow
            label="signals"
            value={geoResolved.available.join(", ") || "—"}
          />
          <div
            style={{
              borderTop: "1px dashed rgba(255,255,255,0.12)",
              margin: "6px 0",
            }}
          />
          <StatRow label="loading" value={String(isLoading)} />
          <StatRow label="results.length" value={results.length} />
          <StatRow label="fallback level" value={fallbackLevel} />
          <StatRow label="fallback label" value={ranked.fallback.label} />
          <StatRow label="strategy" value={ranked.usedStrategy} />
          <StatRow
            label="ranked out / in"
            value={`${ranked.debug.outputCount} / ${ranked.debug.inputCount}`}
          />
          <StatRow label="diversity deferred" value={diversityDeferred} />
          <StatRow
            label="score range"
            value={
              ranked.debug.scoreRange
                ? `${ranked.debug.scoreRange.min}–${ranked.debug.scoreRange.max}`
                : "—"
            }
          />

          {/* ── Phase 3: policy breakdown ──────────────────────────────── */}
          <div style={{ borderTop: "1px dashed rgba(255,255,255,0.12)", margin: "6px 0" }} />
          <div style={{ opacity: 0.6 }}>policy (quickaccess/implicit_geo)</div>
          <StatRow label="maxFallbackLevel" value={debugPolicy.maxFallbackLevel} />
          <StatRow label="allowSynthetic" value={String(debugPolicy.allowSynthetic)} />
          <StatRow label="allowNearbyCities" value={String(debugPolicy.allowNearbyCities)} />
          <StatRow label="allowCategoryDrift" value={String(debugPolicy.allowCategoryDrift)} />
          <StatRow label="allowServiceVariants" value={String(debugPolicy.allowServiceVariants)} />

          <div style={{ borderTop: "1px dashed rgba(255,255,255,0.12)", margin: "6px 0" }} />
          <div style={{ opacity: 0.6 }}>origins</div>
          <StatRow label="real" value={originCounts.real} />
          <StatRow label="relaxed_time" value={originCounts.relaxed_time} />
          <StatRow label="related_service" value={originCounts.related_service} />
          <StatRow label="nearby_city" value={originCounts.nearby_city} />
          <StatRow label="synthetic" value={originCounts.synthetic} />

          <div style={{ borderTop: "1px dashed rgba(255,255,255,0.12)", margin: "6px 0" }} />
          <div style={{ opacity: 0.6 }}>availability confidence</div>
          <StatRow label="calendar_verified" value={confCounts.calendar_verified} />
          <StatRow label="working_hours_only" value={confCounts.working_hours_only} />
          <StatRow label="synthetic_proj." value={confCounts.synthetic_projection} />

          <div style={{ borderTop: "1px dashed rgba(255,255,255,0.12)", margin: "6px 0" }} />
          <div style={{ opacity: 0.6 }}>policy rejected (QA/implicit_geo)</div>
          <StatRow label="rejected total" value={policyRejected} />
          <StatRow label="passed" value={policyPassed.length} />
          <StatRow label="accepted_verified" value={policyCounts.accepted_verified} />
          <StatRow label="accepted_working_hours" value={policyCounts.accepted_working_hours} />
          <StatRow label="rejected_synthetic" value={policyCounts.rejected_synthetic} />
          <StatRow label="rejected_invalid" value={policyCounts.rejected_invalid} />

          {top3.length > 0 && (
            <>
              <div
                style={{
                  borderTop: "1px dashed rgba(255,255,255,0.12)",
                  margin: "6px 0",
                }}
              />
              <div style={{ opacity: 0.6 }}>top 3</div>
              {top3.map((s: RankedSlot) => (
                <div
                  key={`${s.salonId}-${s.startTime}-${s.serviceId ?? ""}`}
                  style={{ fontSize: 10, opacity: 0.85, lineHeight: 1.4 }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {s.rankingMeta.score}
                  </span>{" "}
                  · {s.salonName.slice(0, 14)} · {s.timeLabel}
                  {typeof s.distanceKm === "number" ? ` · ${s.distanceKm}km` : ""}
                  {typeof s.distanceScore === "number" ? ` · ds:${s.distanceScore.toFixed(2)}` : ""}
                  {typeof s.travelMinutesEstimate === "number" ? ` · ${s.travelMinutesEstimate}min` : ""}
                  {s.availabilityConfidence ? ` · ${s.availabilityConfidence}` : ""}
                  {typeof s.availabilityConfidenceScore === "number"
                    ? ` · acs:${s.availabilityConfidenceScore.toFixed(2)}`
                    : ""}
                  {s.availabilityType ? ` · ${s.availabilityType}` : ""}
                  {` · policy:${evaluateFallbackPolicy(s, debugPolicy).accepted ? "yes" : "no"}`}
                  {` · reason:${evaluateFallbackPolicy(s, debugPolicy).reason}`}
                  {s.fromFallback ? " · ↩" : ""}
                  {s.rankingMeta.diversityApplied ? " · div" : ""}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
