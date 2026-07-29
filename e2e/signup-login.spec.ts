import { test, expect } from "@playwright/test";

// Unique test user data with a UK email and GBP-associated country
const TEST_USER = {
  name: "Jane Smith",
  email: `jane.smith+${Date.now()}@example.co.uk`,
  password: "Str0ngP@ss1",
  country: "GB", // United Kingdom → GBP currency
};

test.describe("Signup, logout, and login flow (UK / GBP)", () => {
  test("signs up a new user with a UK email, logs out, then logs back in", async ({
    page,
  }) => {
    // ─── Mock API: registration ──────────────────────────────────────────
    await page.route("**/api/auth/register", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { userId: "test-user-id-123" },
        }),
      });
    });

    // ─── Mock API: email verification (auto-verify) ─────────────────────
    await page.route("**/api/auth/verify-email", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Email verified successfully.",
          data: {
            token: "fake-jwt-token",
            user: {
              id: "test-user-id-123",
              first_name: "Jane",
              last_name: "Smith",
              display_name: "Jane Smith",
              email: TEST_USER.email,
              role: "member",
              trust_score: 100,
            },
          },
        }),
      });
    });

    // ─── Mock API: login ─────────────────────────────────────────────────
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            token: "fake-jwt-token",
            user: {
              id: "test-user-id-123",
              first_name: "Jane",
              last_name: "Smith",
              display_name: "Jane Smith",
              email: TEST_USER.email,
              role: "member",
              trust_score: 100,
            },
          },
        }),
      });
    });

    // ─── Step 1: Navigate to signup page ─────────────────────────────────
    await page.goto("/get-started");

    // ─── Step 2: Fill out the signup form ────────────────────────────────
    await page.getByTestId("signup-name").fill(TEST_USER.name);
    await page.getByTestId("signup-email").fill(TEST_USER.email);
    await page.getByTestId("signup-country").selectOption(TEST_USER.country);
    await page.getByTestId("signup-password").fill(TEST_USER.password);
    await page.getByTestId("signup-agree").check();

    // ─── Step 3: Submit the form ─────────────────────────────────────────
    await page.getByTestId("signup-submit").click();

    // After successful registration the user is redirected to /verify-email
    await expect(page).toHaveURL(/\/verify-email/);

    // ─── Step 4: Simulate email verification ─────────────────────────────
    // Navigate to the verify-email page with a token (simulates clicking the
    // verification link in the email)
    await page.goto("/verify-email?token=fake-verification-token");

    // The verify-email page auto-verifies and redirects to /onboarding
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10000 });

    // ─── Step 5: Confirm user is authenticated ───────────────────────────
    // After verification the session is stored in localStorage
    const session = await page.evaluate(() =>
      localStorage.getItem("padihub_user")
    );
    expect(session).not.toBeNull();
    const parsed = JSON.parse(session!);
    expect(parsed.email).toBe(TEST_USER.email);
    expect(parsed.name).toBe("Jane Smith");

    // ─── Step 6: Log out ─────────────────────────────────────────────────
    // Navigate to the homepage where the header with logout button is visible
    await page.goto("/");
    // Wait for the auth state to mount (header shows logout button for logged-in users)
    await expect(page.getByTestId("logout-button")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("logout-button").click();

    // After logout the user is redirected to "/" and session is cleared
    await expect(page).toHaveURL("/");
    const sessionAfterLogout = await page.evaluate(() =>
      localStorage.getItem("padihub_user")
    );
    expect(sessionAfterLogout).toBeNull();

    // ─── Step 7: Log back in ─────────────────────────────────────────────
    await page.goto("/login");

    await page.getByTestId("login-email").fill(TEST_USER.email);
    await page.getByTestId("login-password").fill(TEST_USER.password);
    await page.getByTestId("login-submit").click();

    // After successful login the user is redirected to /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Confirm session is stored again
    const sessionAfterLogin = await page.evaluate(() =>
      localStorage.getItem("padihub_user")
    );
    expect(sessionAfterLogin).not.toBeNull();
    const parsedAfterLogin = JSON.parse(sessionAfterLogin!);
    expect(parsedAfterLogin.email).toBe(TEST_USER.email);
    expect(parsedAfterLogin.name).toBe("Jane Smith");
  });
});
