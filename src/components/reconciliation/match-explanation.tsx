"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MatchMetadata } from "@/lib/reconciliation/matcher";
import {
  getSimplifiedExplanation,
  getLayerLabel,
  SIGNAL_TO_WEIGHT_KEY,
} from "@/lib/reconciliation/match-display";
import { ConfidenceBadge } from "./confidence-badge";

interface Props {
  matchMetadata: MatchMetadata;
  confidence: string;
  adminMode?: boolean;
}

export function MatchExplanation({ matchMetadata, confidence, adminMode = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const explanation = getSimplifiedExplanation(matchMetadata);

  return (
    <div className="space-y-1">
      {/* Simplified explanation */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{explanation}</span>
        <ConfidenceBadge confidence={confidence} />
      </div>

      {/* Admin mode: expandable signal breakdown */}
      {adminMode && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Debug details
          </button>

          {expanded && (
            <div className="mt-2 space-y-3 rounded-md border bg-muted/30 p-3 text-xs">
              {/* Layer info */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Layer:</span>{" "}
                  <span className="font-medium">{getLayerLabel(matchMetadata.layer)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Candidates:</span>{" "}
                  <span className="tabular-nums font-medium">{matchMetadata.candidateCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Selected rank:</span>{" "}
                  <span className="tabular-nums font-medium">
                    {matchMetadata.selectedRank} of {matchMetadata.candidateCount}
                  </span>
                </div>
              </div>

              {/* Signal breakdown table */}
              {Object.keys(matchMetadata.signals).length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">Signal Breakdown</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-1 text-left font-medium">Signal</th>
                        <th className="py-1 text-right font-medium">Score</th>
                        {matchMetadata.layer === "multi_signal" && (
                          <>
                            <th className="py-1 text-right font-medium">Weight</th>
                            <th className="py-1 text-right font-medium">Contrib</th>
                          </>
                        )}
                        <th className="py-1 text-left font-medium pl-2">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(matchMetadata.signals).map(([key, signal]) => {
                        const weightInfo = SIGNAL_TO_WEIGHT_KEY[key];
                        const contribution = weightInfo
                          ? signal.score * weightInfo.weight
                          : null;
                        return (
                          <tr key={key} className="border-b border-border/50">
                            <td className="py-1 font-medium">{key}</td>
                            <td className="py-1 text-right tabular-nums">
                              <div className="flex items-center justify-end gap-1">
                                <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full bg-primary/60"
                                    style={{ width: `${signal.score * 100}%` }}
                                  />
                                </div>
                                {signal.score.toFixed(2)}
                              </div>
                            </td>
                            {matchMetadata.layer === "multi_signal" && (
                              <>
                                <td className="py-1 text-right tabular-nums">
                                  {weightInfo ? weightInfo.weight.toFixed(2) : "—"}
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {contribution != null ? contribution.toFixed(3) : "—"}
                                </td>
                              </>
                            )}
                            <td className="py-1 pl-2 text-muted-foreground truncate max-w-[200px]">
                              {signal.detail}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {matchMetadata.layer === "multi_signal" && (
                      <tfoot>
                        <tr className="font-medium">
                          <td className="py-1">Total</td>
                          <td />
                          <td />
                          <td className="py-1 text-right tabular-nums">
                            {Object.entries(matchMetadata.signals)
                              .reduce((sum, [key, signal]) => {
                                const w = SIGNAL_TO_WEIGHT_KEY[key]?.weight ?? 0;
                                return sum + signal.score * w;
                              }, 0)
                              .toFixed(3)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* Raw JSON toggle */}
              <div>
                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {showRaw ? "Hide" : "Show"} raw JSON
                </button>
                {showRaw && (
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px]">
                    {JSON.stringify(matchMetadata, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
