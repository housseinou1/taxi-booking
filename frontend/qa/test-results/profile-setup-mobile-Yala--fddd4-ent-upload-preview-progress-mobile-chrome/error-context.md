# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: profile-setup-mobile.spec.mjs >> Yala Delivery Profile Setup — mobile QA >> 6-8. document upload, preview, progress
- Location: profile-setup-mobile.spec.mjs:114:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - img "Yala Delivery" [ref=e5]
    - heading "Yala Delivery" [level=1] [ref=e6]
    - generic [ref=e7]: Yala Delivery — courier app
    - paragraph [ref=e8]: Sign in to continue as rider, driver, or admin with your saved session.
  - generic [ref=e9]:
    - generic [ref=e10]: Too many login attempts. Please try again later.
    - generic [ref=e11]:
      - text: Email
      - textbox "Email" [ref=e12]:
        - /placeholder: Enter your email
        - text: qa-courier-mobile@yala.test
    - generic [ref=e13]:
      - text: Password
      - textbox "Password" [ref=e14]:
        - /placeholder: Enter your password
        - text: QaTest123!
    - button "Log in" [ref=e15] [cursor=pointer]
    - button "Create account" [ref=e16] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect, devices } from "@playwright/test";
  2   | import path from "path";
  3   | import { fileURLToPath } from "url";
  4   | 
  5   | const __dirname = path.dirname(fileURLToPath(import.meta.url));
  6   | const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
  7   | const QA_EMAIL = process.env.QA_COURIER_EMAIL || "qa-courier-mobile@yala.test";
  8   | const QA_PASSWORD = process.env.QA_COURIER_PASSWORD || "QaTest123!";
  9   | const FIXTURE = path.join(__dirname, "fixtures", "test-id.jpg");
  10  | 
  11  | async function loginAsCourier(page) {
  12  |   await page.goto(`${BASE}/login?next=/delivery/profile-setup`, { waitUntil: "networkidle" });
  13  |   const emailInput = page.locator('input[type="email"]');
  14  |   await emailInput.click();
  15  |   await emailInput.fill(QA_EMAIL);
  16  |   const passwordInput = page.locator('input[type="password"]');
  17  |   await passwordInput.click();
  18  |   await passwordInput.fill(QA_PASSWORD);
  19  |   await page.locator('button[type="submit"]').click();
> 20  |   await page.waitForURL(/delivery\/courier/, { timeout: 30000 });
      |              ^ TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
  21  | }
  22  | 
  23  | async function openProfileSetupWizard(page) {
  24  |   await loginAsCourier(page);
  25  |   await page.goto(`${BASE}/delivery/profile-setup`, { waitUntil: "networkidle" });
  26  |   await expect(page.locator("#delivery-courier-type")).toBeVisible({ timeout: 15000 });
  27  | }
  28  | 
  29  | async function clickContinue(page) {
  30  |   await page.getByRole("button", { name: /continue|continue to review|submit for approval/i }).click();
  31  | }
  32  | 
  33  | test.use({
  34  |   ...devices["Pixel 7"],
  35  |   locale: "en-US",
  36  | });
  37  | 
  38  | test.describe("Yala Delivery Profile Setup — mobile QA", () => {
  39  |   test.beforeEach(async ({ page }) => {
  40  |     await openProfileSetupWizard(page);
  41  |   });
  42  | 
  43  |   test("1. dropdown opens and lists courier types", async ({ page }) => {
  44  |     const select = page.locator("#delivery-courier-type");
  45  |     await expect(select).toBeVisible();
  46  |     const options = select.locator("option");
  47  |     await expect(options).toHaveCount(4); // placeholder + 3 types
  48  |     await select.selectOption("bicycle");
  49  |     await expect(select).toHaveValue("bicycle");
  50  |   });
  51  | 
  52  |   test("2. bicycle skips vehicle step", async ({ page }) => {
  53  |     await page.locator("#delivery-courier-type").selectOption("bicycle");
  54  |     await clickContinue(page);
  55  |     await expect(page.getByText("Step 2 of 4")).toBeVisible();
  56  |     await page.fill('input[name="full_name"]', "QA Bicycle Courier");
  57  |     await page.fill('input[name="phone_number"]', "+22222559902");
  58  |     await page.fill('input[name="email"]', QA_EMAIL);
  59  |     await page.selectOption('select[name="city"]', { index: 1 });
  60  |     await page.getByRole("button", { name: /add photo|change photo/i }).click();
  61  |     await page.setInputFiles('input[type="file"][accept*="image"]', FIXTURE);
  62  |     await clickContinue(page);
  63  |     await expect(page.getByText("Upload documents")).toBeVisible();
  64  |     await expect(page.getByText("Step 4 of 4")).toBeVisible();
  65  |     await expect(page.getByText("Motorcycle information")).toHaveCount(0);
  66  |     await expect(page.getByText("Vehicle information")).toHaveCount(0);
  67  |   });
  68  | 
  69  |   test("3. motorcycle shows motorcycle fields", async ({ page }) => {
  70  |     await page.locator("#delivery-courier-type").selectOption("motorcycle");
  71  |     await clickContinue(page);
  72  |     await page.fill('input[name="full_name"]', "QA Moto Courier");
  73  |     await page.fill('input[name="phone_number"]', "+22222559903");
  74  |     await page.fill('input[name="email"]', QA_EMAIL);
  75  |     await page.selectOption('select[name="city"]', { index: 1 });
  76  |     await clickContinue(page);
  77  |     await expect(page.getByText("Step 3 of 4")).toBeVisible();
  78  |     await expect(page.getByText("Motorcycle information")).toBeVisible();
  79  |     await page.fill('input[name="vehicle_make"]', "Honda");
  80  |     await page.fill('input[name="vehicle_model"]', "Wave");
  81  |     await page.fill('input[name="vehicle_color"]', "Red");
  82  |     await page.fill('input[name="plate_number"]', "NKC-QA-01");
  83  |     await clickContinue(page);
  84  |     await expect(page.getByText("Upload documents")).toBeVisible();
  85  |   });
  86  | 
  87  |   test("4. vehicle/car shows vehicle fields", async ({ page }) => {
  88  |     await page.locator("#delivery-courier-type").selectOption("car");
  89  |     await clickContinue(page);
  90  |     await page.fill('input[name="full_name"]', "QA Car Courier");
  91  |     await page.fill('input[name="phone_number"]', "+22222559904");
  92  |     await page.fill('input[name="email"]', QA_EMAIL);
  93  |     await page.selectOption('select[name="city"]', { index: 1 });
  94  |     await clickContinue(page);
  95  |     await expect(page.getByText("Vehicle information")).toBeVisible();
  96  |     await page.fill('input[name="vehicle_make"]', "Toyota");
  97  |     await page.fill('input[name="vehicle_model"]', "Corolla");
  98  |     await page.fill('input[name="vehicle_color"]', "White");
  99  |     await page.fill('input[name="plate_number"]', "NKC-QA-02");
  100 |     await clickContinue(page);
  101 |     await expect(page.getByText("Upload documents")).toBeVisible();
  102 |   });
  103 | 
  104 |   test("5. back and next navigation", async ({ page }) => {
  105 |     await page.locator("#delivery-courier-type").selectOption("motorcycle");
  106 |     await clickContinue(page);
  107 |     await expect(page.getByText("Personal information")).toBeVisible();
  108 |     await page.getByRole("button", { name: "Back" }).click();
  109 |     await expect(page.getByText("How will you deliver?")).toBeVisible();
  110 |     await clickContinue(page);
  111 |     await expect(page.getByText("Personal information")).toBeVisible();
  112 |   });
  113 | 
  114 |   test("6-8. document upload, preview, progress", async ({ page }) => {
  115 |     await page.locator("#delivery-courier-type").selectOption("bicycle");
  116 |     await clickContinue(page);
  117 |     await page.fill('input[name="full_name"]', "QA Upload Courier");
  118 |     await page.fill('input[name="phone_number"]', "+22222559905");
  119 |     await page.fill('input[name="email"]', QA_EMAIL);
  120 |     await page.selectOption('select[name="city"]', { index: 1 });
```