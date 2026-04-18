/**
 * Visual smoke tests for the Kebab MCP dashboard.
 *
 * Takes screenshots at different viewports for manual diffing.
 * Screenshots are regenerated on each run (gitignored).
 *
 * Prerequisites:
 * - A running Kebab MCP server (npm run dev) or set PLAYWRIGHT_BASE_URL
 * - Chromium installed: npx playwright install chromium
 * - MCP_AUTH_TOKEN set in .env (used for auth cookie)
 */
import { test, expect } from "@playwright/test";
import path from "node:path";

const screenshotDir = path.resolve(__dirname, "screenshots");

// Auth: the dashboard uses a cookie set by the middleware.
// We authenticate by passing the token as a query param on the first
// request, which sets the admin cookie for subsequent navigation.
const token = process.env.MCP_AUTH_TOKEN || "test-token";

test("config page — desktop (1280px)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // Authenticate via query param — middleware sets the admin cookie
  await page.goto(`/config?token=${token}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toBeVisible();
  // Dashboard should show the Overview tab or at least the sidebar
  const hasContent =
    (await page.locator("text=Overview").count()) > 0 ||
    (await page.locator("text=Connectors").count()) > 0;
  expect(hasContent).toBe(true);
  await page.screenshot({
    path: path.join(screenshotDir, "config-desktop.png"),
    fullPage: true,
  });
});

test("config page — mobile (375px)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/config?token=${token}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDir, "config-mobile.png"),
    fullPage: true,
  });
});

test("welcome page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/welcome");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toBeVisible();
  // Welcome page may show "Welcome to Kebab MCP" or redirect to /config
  // if already initialized — both are valid states
  await page.screenshot({
    path: path.join(screenshotDir, "welcome.png"),
    fullPage: true,
  });
});

test("connectors tab — desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/config?tab=connectors&token=${token}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDir, "connectors-desktop.png"),
    fullPage: true,
  });
});

test("tools tab — desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/config?tab=tools&token=${token}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDir, "tools-desktop.png"),
    fullPage: true,
  });
});

test("playground tab — desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/config?tab=playground&token=${token}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDir, "playground-desktop.png"),
    fullPage: true,
  });
});

test("settings tab — desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/config?tab=settings&token=${token}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDir, "settings-desktop.png"),
    fullPage: true,
  });
});

test("sidebar sticky — scroll main content", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(`/config?tab=connectors&token=${token}`);
  await page.waitForLoadState("networkidle");
  // Scroll main content down
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(300);
  // Sidebar should still be visible (sticky)
  const sidebar = page.locator("aside");
  if ((await sidebar.count()) > 0) {
    await expect(sidebar.first()).toBeVisible();
  }
  await page.screenshot({
    path: path.join(screenshotDir, "sidebar-sticky.png"),
    fullPage: false, // viewport only, not full page
  });
});
