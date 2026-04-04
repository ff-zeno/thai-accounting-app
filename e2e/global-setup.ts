import "dotenv/config";
import { clerkSetup, clerk } from "@clerk/testing/playwright";
import { chromium, type FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig) {
  // 1. Initialize Clerk testing — fetches testing token via CLERK_SECRET_KEY
  await clerkSetup();

  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://localhost:3015";

  // 2. Launch browser and authenticate
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  // 3. Navigate to sign-in page (loads window.Clerk)
  await page.goto("/sign-in");

  // 4. Sign in via Clerk testing helpers (ticket strategy — bypasses 2FA)
  const email =
    process.env.E2E_CLERK_USER_EMAIL ?? "deadlywave@hotmail.com";
  await clerk.signIn({ page, emailAddress: email });

  // 5. Set org and locale cookies
  const domain = new URL(baseURL).hostname;
  await context.addCookies([
    {
      name: "active_org_id",
      value: "95aead7c-9942-474f-b48e-2ec5b46f10c9",
      domain,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "NEXT_LOCALE",
      value: "en",
      domain,
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);

  // 6. Verify auth + org work by loading dashboard
  await page.goto("/dashboard");
  await page.locator("main").waitFor({ state: "visible", timeout: 15_000 });

  // 7. Save auth state for all tests
  await context.storageState({ path: ".auth/user.json" });

  await browser.close();
}
