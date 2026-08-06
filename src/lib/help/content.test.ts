import { describe, expect, it } from "vitest";
import {
  DEFAULT_HELP_ENTRY,
  HELP_CONTENT,
  resolveHelpEntry,
} from "./content";
import { HELP_GLOSSARY } from "./glossary";

describe("resolveHelpEntry", () => {
  it("returns the exact entry for a registered route", () => {
    expect(resolveHelpEntry("/dashboard")).toBe(HELP_CONTENT["/dashboard"]);
    expect(resolveHelpEntry("/tax/vat")).toBe(HELP_CONTENT["/tax/vat"]);
  });

  it("matches sub-routes via longest prefix", () => {
    expect(resolveHelpEntry("/tax/vat/forecast")).toBe(
      HELP_CONTENT["/tax/vat"]
    );
    expect(resolveHelpEntry("/reconciliation/ai-review")).toBe(
      HELP_CONTENT["/reconciliation"]
    );
    expect(resolveHelpEntry("/tax/withholding/filings/123")).toBe(
      HELP_CONTENT["/tax/withholding"]
    );
  });

  // The registry is keyed by route prefix with a silent fallback, so a
  // section that gets renamed without its key keeps rendering — just with
  // the wrong (default) help. These pin the money-flow sections that were
  // split out of /documents on 2026-08-05.
  it("serves the Income and Expenses sections and their sub-routes", () => {
    expect(resolveHelpEntry("/income")).toBe(HELP_CONTENT["/income"]);
    expect(resolveHelpEntry("/income/upload")).toBe(HELP_CONTENT["/income"]);
    expect(resolveHelpEntry("/income/settlements")).toBe(
      HELP_CONTENT["/income"]
    );
    expect(resolveHelpEntry("/expenses")).toBe(HELP_CONTENT["/expenses"]);
    expect(resolveHelpEntry("/expenses/upload")).toBe(
      HELP_CONTENT["/expenses"]
    );
  });

  it("keeps document review on the /documents entry", () => {
    expect(resolveHelpEntry("/documents/abc-123/review")).toBe(
      HELP_CONTENT["/documents"]
    );
  });

  it("is segment-aware — a partial segment is not a prefix match", () => {
    expect(resolveHelpEntry("/tax/vatx")).toBe(DEFAULT_HELP_ENTRY);
    expect(resolveHelpEntry("/dashboards")).toBe(DEFAULT_HELP_ENTRY);
  });

  it("falls back to the default entry for unknown routes", () => {
    expect(resolveHelpEntry("/vendors")).toBe(DEFAULT_HELP_ENTRY);
    expect(resolveHelpEntry("/")).toBe(DEFAULT_HELP_ENTRY);
    expect(resolveHelpEntry("")).toBe(DEFAULT_HELP_ENTRY);
  });

  it("ignores trailing slashes", () => {
    expect(resolveHelpEntry("/dashboard/")).toBe(HELP_CONTENT["/dashboard"]);
    expect(resolveHelpEntry("/tax/vat/")).toBe(HELP_CONTENT["/tax/vat"]);
  });
});

describe("help content integrity", () => {
  const allEntries = [DEFAULT_HELP_ENTRY, ...Object.values(HELP_CONTENT)];

  it("every referenced glossary term exists", () => {
    for (const entry of allEntries) {
      for (const term of entry.terms ?? []) {
        expect(HELP_GLOSSARY[term], `missing glossary term: ${term}`).toBeDefined();
      }
    }
  });

  it("every entry has bilingual title and at least one section", () => {
    for (const entry of allEntries) {
      expect(entry.title.en.length).toBeGreaterThan(0);
      expect(entry.title.th.length).toBeGreaterThan(0);
      expect(entry.sections.length).toBeGreaterThan(0);
      for (const section of entry.sections) {
        expect(section.heading.en.length).toBeGreaterThan(0);
        expect(section.heading.th.length).toBeGreaterThan(0);
        expect(section.body.en.length).toBeGreaterThan(0);
        expect(section.body.th.length).toBeGreaterThan(0);
      }
    }
  });
});
