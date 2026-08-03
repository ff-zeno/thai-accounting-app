import { test, expect } from "../fixtures/auth";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const E2E_ORG_ID = "95aead7c-9942-474f-b48e-2ec5b46f10c9";

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function seedWhtFormGroupingFixture() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const paymentDate = isoDate(year, month, 15);

  const [localVendor] = await db
    .insert(schema.vendors)
    .values({
      orgId: E2E_ORG_ID,
      name: "E2E Local Corporate PND53",
      entityType: "company",
      country: "TH",
    })
    .returning();
  const [foreignVendor] = await db
    .insert(schema.vendors)
    .values({
      orgId: E2E_ORG_ID,
      name: "E2E Foreign Service PND54",
      entityType: "foreign",
      country: "SG",
    })
    .returning();
  const [customer] = await db
    .insert(schema.vendors)
    .values({
      orgId: E2E_ORG_ID,
      name: "E2E Customer Incoming WHT",
      entityType: "company",
      country: "TH",
    })
    .returning();

  const fixtures = [
    {
      certificateNo: `E2E-PND53-${year}-${String(month).padStart(2, "0")}`,
      payeeVendorId: localVendor.id,
      formType: "pnd53" as const,
      totalBaseAmount: "10000.00",
      totalWht: "300.00",
    },
    {
      certificateNo: `E2E-PND54-${year}-${String(month).padStart(2, "0")}`,
      payeeVendorId: foreignVendor.id,
      formType: "pnd54" as const,
      totalBaseAmount: "20000.00",
      totalWht: "3000.00",
      belowDefault: true,
    },
  ];

  for (const fixture of fixtures) {
    await db
      .insert(schema.whtCertificates)
      .values({
        orgId: E2E_ORG_ID,
        certificateNo: fixture.certificateNo,
        payeeVendorId: fixture.payeeVendorId,
        paymentDate,
        totalBaseAmount: fixture.totalBaseAmount,
        totalWht: fixture.totalWht,
        formType: fixture.formType,
        status: "issued",
        rateBelowDefaultAcknowledgedByUserId: fixture.belowDefault
          ? "e2e-owner"
          : null,
        rateBelowDefaultAcknowledgedAt: fixture.belowDefault ? now : null,
        rateBelowDefaultStatutoryRate: fixture.belowDefault ? "0.1500" : null,
        rateBelowDefaultSelectedRate: fixture.belowDefault ? "0.0500" : null,
        rateBelowDefaultRationale: fixture.belowDefault
          ? "E2E CPA-reviewed treaty position"
          : null,
      })
      .onConflictDoNothing({
        target: [
          schema.whtCertificates.orgId,
          schema.whtCertificates.certificateNo,
        ],
      });
    if (fixture.belowDefault) {
      await db
        .update(schema.whtCertificates)
        .set({
          rateBelowDefaultAcknowledgedByUserId: "e2e-owner",
          rateBelowDefaultAcknowledgedAt: now,
          rateBelowDefaultStatutoryRate: "0.1500",
          rateBelowDefaultSelectedRate: "0.0500",
          rateBelowDefaultRationale: "E2E CPA-reviewed treaty position",
        })
        .where(
          sql`${schema.whtCertificates.orgId} = ${E2E_ORG_ID}
            AND ${schema.whtCertificates.certificateNo} = ${fixture.certificateNo}`
        );
    }
  }

  const incomingCertificateNo = `E2E-IN-WHT-${year}-${String(month).padStart(2, "0")}`;
  const existingIncoming = await db
    .select({ id: schema.whtCreditsReceived.id })
    .from(schema.whtCreditsReceived)
    .where(
      sql`${schema.whtCreditsReceived.orgId} = ${E2E_ORG_ID}
        AND ${schema.whtCreditsReceived.certificateNo} = ${incomingCertificateNo}
        AND ${schema.whtCreditsReceived.deletedAt} IS NULL`
    )
    .limit(1);

  if (existingIncoming.length === 0) {
    await db.insert(schema.whtCreditsReceived).values({
      orgId: E2E_ORG_ID,
      customerVendorId: customer.id,
      paymentDate,
      grossAmount: "15000.00",
      whtAmount: "450.00",
      formType: "pnd53",
      taxYear: year,
      certificateNo: incomingCertificateNo,
    });
  }
}

test.describe("Withholding Tax Workflow", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await seedWhtFormGroupingFixture();
  });

  test("dashboard separates incoming and outgoing workflows", async ({ page }) => {
    await page.goto("/tax/withholding");

    await expect(
      page.getByRole("heading", { name: /Withholding Tax Dashboard/i }),
    ).toBeVisible();

    // The section tab strip and the dashboard's workflow cards both link to
    // the four WHT areas; scope to each surface to stay strict-mode safe.
    const sectionNav = page.getByRole("navigation", {
      name: "Section navigation",
    });
    for (const area of [
      "Incoming WHT",
      "Outgoing WHT",
      "WHT Register",
      "WHT Filings",
    ]) {
      await expect(
        sectionNav.getByRole("link", { name: area, exact: true }),
      ).toBeVisible();
    }

    // The workflow cards carry the explanations the tab strip cannot.
    await expect(
      page.getByText(/Tax credits withheld by customers when they pay us/i),
    ).toBeVisible();
    await expect(
      page.getByText(/Tax we withhold when paying vendors or contractors/i),
    ).toBeVisible();
    await expect(
      page.locator("main").getByText("Tax Workflow Exceptions", { exact: true }),
    ).toBeVisible();
  });

  test("incoming WHT route renders credit workflow", async ({ page }) => {
    await page.goto("/tax/withholding/incoming");

    await expect(page.getByRole("heading", { name: /Incoming WHT/i })).toBeVisible();
    await expect(page.getByText(/New Credit/i)).toBeVisible();
  });

  test("outgoing WHT route renders certificate workflow", async ({ page }) => {
    await page.goto("/tax/withholding/outgoing");

    await expect(page.getByRole("heading", { name: /Outgoing WHT/i })).toBeVisible();
    await expect(
      page.getByText(/certificates issued to payees/i),
    ).toBeVisible();
    await expect(page.getByText(/live Blob\/Inngest storage QA/i)).toBeVisible();
    await expect(page.getByText("Rate Review")).toBeVisible();
    await expect(page.getByText("Below default")).toBeVisible();
    await expect(page.getByText("E2E CPA-reviewed treaty position")).toBeVisible();
  });

  test("domestic PND53 certificates keep the normal default-rate flow", async ({ page }) => {
    await page.goto("/tax/withholding/outgoing");

    const localRow = page.getByRole("row", {
      name: /E2E Local Corporate PND53/,
    });
    await expect(localRow).toBeVisible();
    await expect(localRow.getByText("PND 53")).toBeVisible();
    await expect(localRow.getByText("Default ok")).toBeVisible();
    await expect(localRow.getByRole("button", { name: /Generate PDF/i })).toBeVisible();
    await expect(localRow.getByRole("button", { name: /Reissue/i })).toBeVisible();
    await expect(localRow.getByText("Below default")).not.toBeVisible();
  });

  test("register links to evidence and filing workflows", async ({ page }) => {
    await page.goto("/tax/withholding/register");

    await expect(page.getByRole("heading", { name: /WHT Register/i })).toBeVisible();
    await expect(page.getByText("Incoming Credits", { exact: true })).toBeVisible();
    await expect(page.getByText("Outgoing Withheld")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Direction/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Filing/i })).toBeVisible();
  });

  test("register shows mixed incoming and outgoing WHT in the same month", async ({ page }) => {
    await page.goto("/tax/withholding/register");

    await expect(page.getByText("Incoming Credits", { exact: true })).toBeVisible();
    await expect(page.getByText("Outgoing Withheld")).toBeVisible();
    await expect(page.getByRole("row", { name: /incoming E2E Customer Incoming WHT/i })).toBeVisible();
    await expect(page.getByRole("row", { name: /outgoing E2E Local Corporate PND53/i })).toBeVisible();
    await expect(page.getByRole("row", { name: /outgoing E2E Foreign Service PND54/i })).toBeVisible();
  });

  test("filings route exposes PND form tabs after loading a period", async ({ page }) => {
    await page.goto("/tax/withholding/filings");

    await expect(page.getByRole("heading", { name: /WHT Filings/i })).toBeVisible();
    await page.getByRole("button", { name: /Load Period/i }).click();
    await expect(page.getByRole("tab", { name: "PND 2" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "PND 3" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "PND 53" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "PND 54" })).toBeVisible();
  });

  test("filings UI keeps PND 54 separate from PND 53 with data", async ({ page }) => {
    await page.goto("/tax/withholding/filings");

    await page.getByRole("button", { name: /Load Period/i }).click();

    await page.getByRole("tab", { name: /PND 53/ }).click();
    const pnd53Row = page.getByRole("row", {
      name: /E2E Local Corporate PND53/,
    });
    await expect(pnd53Row).toBeVisible();
    await expect(pnd53Row.getByText("10,000.00")).toBeVisible();
    await expect(pnd53Row.getByText("300.00")).toBeVisible();
    await expect(page.getByText("E2E Foreign Service PND54")).not.toBeVisible();

    await page.getByRole("tab", { name: /PND 54/ }).click();
    const pnd54Row = page.getByRole("row", {
      name: /E2E Foreign Service PND54/,
    });
    await expect(pnd54Row).toBeVisible();
    await expect(pnd54Row.getByText("20,000.00")).toBeVisible();
    await expect(pnd54Row.getByText("3,000.00")).toBeVisible();
    await expect(page.getByText("E2E Local Corporate PND53")).not.toBeVisible();
  });
});
