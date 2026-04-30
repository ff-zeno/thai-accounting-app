/**
 * Phase 8 Dogfood — chain parse → score → seed → run-tier1 → compare.
 *
 * Usage:
 *   pnpm tsx benchmarks/dogfood/cycle.ts <outDir> --org-id <uuid> [--dry-run] [--skip <step>]
 *
 * Flags:
 *   --org-id     REQUIRED. DB uuid of the dogfood target org.
 *   --dry-run    Forwards to seed-tier1.ts; every other step is read-only anyway.
 *   --skip       Skip a step by name: parse | score-tier0 | seed | run-tier1 | compare.
 *                Repeatable. Useful when resuming after a partial failure.
 *
 * Between write steps the script prompts (via stderr) for a keystroke so you
 * can inspect intermediate output before the next phase continues.
 */

import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local" });

interface CliArgs {
  outDir: string;
  orgId: string;
  dryRun: boolean;
  skip: Set<string>;
}

function parseCli(argv: string[]): CliArgs {
  const outDir = argv[0];
  if (!outDir) {
    console.error(
      "Usage: pnpm tsx benchmarks/dogfood/cycle.ts <outDir> --org-id <uuid> [--dry-run] [--skip <step>]"
    );
    process.exit(1);
  }
  let orgId = "";
  let dryRun = false;
  const skip = new Set<string>();
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--org-id") orgId = argv[++i];
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--skip") skip.add(argv[++i]);
  }
  if (!orgId) {
    console.error("--org-id <uuid> is required");
    process.exit(1);
  }
  return { outDir, orgId, dryRun, skip };
}

function runStep(label: string, command: string, args: string[]): void {
  console.log("");
  console.log("─".repeat(72));
  console.log(`STEP: ${label}`);
  console.log(`CMD:  ${command} ${args.join(" ")}`);
  console.log("─".repeat(72));
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`Step "${label}" failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function main() {
  const args = parseCli(process.argv.slice(2));

  if (!args.skip.has("parse")) {
    runStep("parse-review", "pnpm", [
      "tsx",
      "benchmarks/dogfood/parse-review.ts",
      args.outDir,
    ]);
  }

  if (!args.skip.has("score-tier0")) {
    runStep("score (tier 0)", "pnpm", [
      "tsx",
      "benchmarks/dogfood/score.ts",
      args.outDir,
      "--label",
      "tier0",
      "--source",
      "tier0",
    ]);
  }

  if (!args.skip.has("seed")) {
    const seedArgs = [
      "tsx",
      "benchmarks/dogfood/seed-tier1.ts",
      args.outDir,
      "--org-id",
      args.orgId,
    ];
    if (args.dryRun) seedArgs.push("--dry-run");
    runStep("seed-tier1", "pnpm", seedArgs);
  }

  if (!args.skip.has("run-tier1")) {
    if (args.dryRun) {
      console.log("");
      console.log("(dry-run) skipping run-tier1 — no exemplars were seeded");
    } else {
      runStep("run-tier1", "pnpm", [
        "tsx",
        "benchmarks/dogfood/run-tier1.ts",
        args.outDir,
        "--org-id",
        args.orgId,
      ]);
    }
  }

  if (!args.skip.has("compare") && !args.dryRun) {
    runStep("compare", "pnpm", [
      "tsx",
      "benchmarks/dogfood/compare.ts",
      args.outDir,
    ]);
  }

  console.log("");
  console.log(
    `Cycle complete. Artifacts in ${args.outDir}/ — inspect delta-report.md for the headline.`
  );
}

main();
