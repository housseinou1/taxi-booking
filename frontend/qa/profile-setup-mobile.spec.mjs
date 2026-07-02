import { test, expect, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const QA_EMAIL = process.env.QA_COURIER_EMAIL || "qa-courier-mobile@yala.test";
const QA_PASSWORD = process.env.QA_COURIER_PASSWORD || "QaTest123!";
const FIXTURE = path.join(__dirname, "fixtures", "test-id.jpg");

async function loginAsCourier(page) {
  await page.goto(`${BASE}/login?next=/delivery/profile-setup`, { waitUntil: "networkidle" });
  const emailInput = page.locator('input[type="email"]');
  await emailInput.click();
  await emailInput.fill(QA_EMAIL);
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.click();
  await passwordInput.fill(QA_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/delivery\/courier/, { timeout: 30000 });
}

async function openProfileSetupWizard(page) {
  await loginAsCourier(page);
  await page.goto(`${BASE}/delivery/profile-setup`, { waitUntil: "networkidle" });
  await expect(page.locator("#delivery-courier-type")).toBeVisible({ timeout: 15000 });
}

async function clickContinue(page) {
  await page.getByRole("button", { name: /continue|continue to review|submit for approval/i }).click();
}

test.use({
  ...devices["Pixel 7"],
  locale: "en-US",
});

test.describe("Yala Delivery Profile Setup — mobile QA", () => {
  test.beforeEach(async ({ page }) => {
    await openProfileSetupWizard(page);
  });

  test("1. dropdown opens and lists courier types", async ({ page }) => {
    const select = page.locator("#delivery-courier-type");
    await expect(select).toBeVisible();
    const options = select.locator("option");
    await expect(options).toHaveCount(4); // placeholder + 3 types
    await select.selectOption("bicycle");
    await expect(select).toHaveValue("bicycle");
  });

  test("2. bicycle skips vehicle step", async ({ page }) => {
    await page.locator("#delivery-courier-type").selectOption("bicycle");
    await clickContinue(page);
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await page.fill('input[name="full_name"]', "QA Bicycle Courier");
    await page.fill('input[name="phone_number"]', "+22222559902");
    await page.fill('input[name="email"]', QA_EMAIL);
    await page.selectOption('select[name="city"]', { index: 1 });
    await page.getByRole("button", { name: /add photo|change photo/i }).click();
    await page.setInputFiles('input[type="file"][accept*="image"]', FIXTURE);
    await clickContinue(page);
    await expect(page.getByText("Upload documents")).toBeVisible();
    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await expect(page.getByText("Motorcycle information")).toHaveCount(0);
    await expect(page.getByText("Vehicle information")).toHaveCount(0);
  });

  test("3. motorcycle shows motorcycle fields", async ({ page }) => {
    await page.locator("#delivery-courier-type").selectOption("motorcycle");
    await clickContinue(page);
    await page.fill('input[name="full_name"]', "QA Moto Courier");
    await page.fill('input[name="phone_number"]', "+22222559903");
    await page.fill('input[name="email"]', QA_EMAIL);
    await page.selectOption('select[name="city"]', { index: 1 });
    await clickContinue(page);
    await expect(page.getByText("Step 3 of 4")).toBeVisible();
    await expect(page.getByText("Motorcycle information")).toBeVisible();
    await page.fill('input[name="vehicle_make"]', "Honda");
    await page.fill('input[name="vehicle_model"]', "Wave");
    await page.fill('input[name="vehicle_color"]', "Red");
    await page.fill('input[name="plate_number"]', "NKC-QA-01");
    await clickContinue(page);
    await expect(page.getByText("Upload documents")).toBeVisible();
  });

  test("4. vehicle/car shows vehicle fields", async ({ page }) => {
    await page.locator("#delivery-courier-type").selectOption("car");
    await clickContinue(page);
    await page.fill('input[name="full_name"]', "QA Car Courier");
    await page.fill('input[name="phone_number"]', "+22222559904");
    await page.fill('input[name="email"]', QA_EMAIL);
    await page.selectOption('select[name="city"]', { index: 1 });
    await clickContinue(page);
    await expect(page.getByText("Vehicle information")).toBeVisible();
    await page.fill('input[name="vehicle_make"]', "Toyota");
    await page.fill('input[name="vehicle_model"]', "Corolla");
    await page.fill('input[name="vehicle_color"]', "White");
    await page.fill('input[name="plate_number"]', "NKC-QA-02");
    await clickContinue(page);
    await expect(page.getByText("Upload documents")).toBeVisible();
  });

  test("5. back and next navigation", async ({ page }) => {
    await page.locator("#delivery-courier-type").selectOption("motorcycle");
    await clickContinue(page);
    await expect(page.getByText("Personal information")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("How will you deliver?")).toBeVisible();
    await clickContinue(page);
    await expect(page.getByText("Personal information")).toBeVisible();
  });

  test("6-8. document upload, preview, progress", async ({ page }) => {
    await page.locator("#delivery-courier-type").selectOption("bicycle");
    await clickContinue(page);
    await page.fill('input[name="full_name"]', "QA Upload Courier");
    await page.fill('input[name="phone_number"]', "+22222559905");
    await page.fill('input[name="email"]', QA_EMAIL);
    await page.selectOption('select[name="city"]', { index: 1 });
    await page.getByRole("button", { name: /add photo|change photo/i }).click();
    await page.setInputFiles('input[type="file"][accept*="image"]', FIXTURE);
    await clickContinue(page);

    await expect(page.getByText("0% complete")).toBeVisible();
    const uploadBtn = page.getByRole("button", { name: "Upload" }).first();
    await uploadBtn.click();
    await page.setInputFiles('input[type="file"][accept*=".pdf"]', FIXTURE);
    await expect(page.getByText(/100% complete|Uploaded|Pending review/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".delivery-courier-doc-card__preview img, .delivery-courier-doc-card__preview")).toBeVisible();
  });

  test("9-10. submit for approval and success screen", async ({ page }) => {
    await page.locator("#delivery-courier-type").selectOption("bicycle");
    await clickContinue(page);
    await page.fill('input[name="full_name"]', "QA Submit Courier");
    await page.fill('input[name="phone_number"]', "+22222559906");
    await page.fill('input[name="email"]', QA_EMAIL);
    await page.selectOption('select[name="city"]', { index: 1 });
    await page.getByRole("button", { name: /add photo|change photo/i }).click();
    await page.setInputFiles('input[type="file"][accept*="image"]', FIXTURE);
    await clickContinue(page);

    await page.getByRole("button", { name: "Upload" }).first().click();
    await page.setInputFiles('input[type="file"][accept*=".pdf"]', FIXTURE);
    await expect(page.getByText(/100% complete/i)).toBeVisible({ timeout: 15000 });

    await clickContinue(page);
    await expect(page.getByText("Review and submit")).toBeVisible();
    await page.locator('.delivery-profile-setup__terms-check input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await expect(page.getByText("Your Yala Delivery application is under review.")).toBeVisible({ timeout: 20000 });
  });

  test("11. no Yala Driver green theme on profile setup", async ({ page }) => {
    const driverGreen = await page.evaluate(() => {
      const bar = document.querySelector(".delivery-onboarding-progress-bar");
      if (!bar) return null;
      return getComputedStyle(bar).backgroundImage + getComputedStyle(bar).backgroundColor;
    });
    expect(driverGreen || "").not.toMatch(/#00A651|0, 166, 81/i);
    await expect(page.locator(".lyft-driver, .driver-dashboard, [class*='lyft-driver']")).toHaveCount(0);
    const hasDeliveryTheme = await page.evaluate(() =>
      document.documentElement.classList.contains("yala-app--delivery") ||
      Boolean(document.querySelector(".delivery-courier-stepper"))
    );
    expect(hasDeliveryTheme).toBeTruthy();
  });
});
