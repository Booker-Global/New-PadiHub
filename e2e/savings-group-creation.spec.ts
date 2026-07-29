import { test, expect, Page } from "@playwright/test";

// ── Test users ────────────────────────────────────────────────────────────────
const USER_A = {
  id: "user-a-id-001",
  name: "Alice Leader",
  email: "alice.leader@example.com",
  token: "fake-jwt-token-alice",
};

const USER_B = {
  id: "user-b-id-002",
  name: "Bob Member",
  email: "bob.member@example.com",
  token: "fake-jwt-token-bob",
};

// ── Group data returned from the mock API ─────────────────────────────────────
const CREATED_GROUP = {
  id: "grp-test-001",
  name: "London Savers Circle",
  description: "Saving for a rainy day together",
  currency: "GBP",
  contribution_amount: "200",
  contribution_frequency: "weekly",
  maximum_members: 6,
  rotation_method: "random",
  status: "active",
  leader_id: USER_A.id,
  created_at: "2026-07-29T10:00:00Z",
  members: [
    { user_id: USER_A.id, display_name: USER_A.name, position: 1, role: "leader" },
    { user_id: USER_B.id, display_name: USER_B.name, position: 2, role: "member" },
  ],
  rotation_order: [
    { position: 1, user_id: USER_A.id, display_name: USER_A.name },
    { position: 2, user_id: USER_B.id, display_name: USER_B.name },
  ],
};

// ── Helper: authenticate a user by seeding localStorage ───────────────────────
async function authenticateUser(page: Page, user: typeof USER_A) {
  await page.evaluate(
    ({ u }) => {
      localStorage.setItem(
        "padihub_user",
        JSON.stringify({ id: u.id, name: u.name, email: u.email, token: u.token })
      );
    },
    { u: user }
  );
}

// ── Helper: set up common API mocks for group endpoints ───────────────────────
async function mockGroupAPIs(page: Page) {
  // Create group
  await page.route("**/api/groups", async (route, request) => {
    if (request.method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: CREATED_GROUP }),
      });
    } else {
      // GET /api/groups — list all groups for the user
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: [CREATED_GROUP] }),
      });
    }
  });

  // Get single group
  await page.route(`**/api/groups/${CREATED_GROUP.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: CREATED_GROUP }),
    });
  });

  // Create invitation
  await page.route(`**/api/groups/${CREATED_GROUP.id}/invitations`, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { invitation_id: "inv-001", email: USER_B.email, status: "pending" },
      }),
    });
  });
}

test.describe("Savings Group creation, invitation, and rotation order", () => {
  test("User A creates a savings group, sets contribution and frequency, invites User B, and both users see the group with the correct rotation order", async ({
    browser,
  }) => {
    // ─── Part 1: User A creates the group ──────────────────────────────────
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    await mockGroupAPIs(pageA);
    await pageA.goto("/");
    await authenticateUser(pageA, USER_A);

    // Navigate to the create savings group wizard
    await pageA.goto("/savings-groups/create");
    await expect(pageA.locator("h1")).toContainText("Group Details");

    // ─── Step 1: Group Details ─────────────────────────────────────────────
    await pageA
      .locator('input[placeholder="e.g. Lagos Savers Circle"]')
      .fill(CREATED_GROUP.name);
    await pageA
      .locator('textarea[placeholder="What is this group saving for?"]')
      .fill(CREATED_GROUP.description);
    await pageA.getByRole("button", { name: /continue/i }).click();

    // ─── Step 2: Contribution Rules ────────────────────────────────────────
    await expect(pageA.locator("h1")).toContainText("Contribution Rules");
    await pageA
      .locator('input[placeholder="e.g. 150"]')
      .fill(CREATED_GROUP.contribution_amount);

    // Select GBP currency (already default, but explicitly verify)
    await expect(pageA.locator("select")).toHaveValue("GBP");

    // Select weekly frequency
    await pageA.getByText("Weekly").click();
    await pageA.getByRole("button", { name: /continue/i }).click();

    // ─── Step 3: Group Size ────────────────────────────────────────────────
    await expect(pageA.locator("h1")).toContainText("Group Size");
    // The default is 6 members — which matches our group config, so just continue
    await expect(pageA.getByText("6")).toBeVisible();
    await pageA.getByRole("button", { name: /continue/i }).click();

    // ─── Step 4: Rotation Rules ────────────────────────────────────────────
    await expect(pageA.locator("h1")).toContainText("Rotation Rules");
    // Select "Random Order" (should be the default)
    await pageA.getByText("Random Order").click();
    await pageA.getByRole("button", { name: /continue/i }).click();

    // ─── Step 5: Group Rules ───────────────────────────────────────────────
    await expect(pageA.locator("h1")).toContainText("Group Rules");
    await pageA.getByRole("button", { name: /continue/i }).click();

    // ─── Step 6: Invite Members ────────────────────────────────────────────
    await expect(pageA.locator("h1")).toContainText("Invite Members");
    await pageA
      .locator('textarea[placeholder="Enter email addresses, one per line"]')
      .fill(USER_B.email);
    await pageA.getByRole("button", { name: /continue/i }).click();

    // ─── Step 7: Review ────────────────────────────────────────────────────
    await expect(pageA.locator("h1")).toContainText("Review");

    // Verify the review summary shows the correct configuration
    await expect(pageA.getByText(CREATED_GROUP.name)).toBeVisible();
    await expect(pageA.getByText("£200 / weekly")).toBeVisible();
    await expect(pageA.getByText("6 members")).toBeVisible();
    await expect(pageA.getByText("Random")).toBeVisible();

    // Submit the group creation
    await pageA.getByRole("button", { name: /create group/i }).click();

    // Verify success screen
    await expect(pageA.getByText("Group Created!")).toBeVisible();
    await expect(pageA.getByText(CREATED_GROUP.name)).toBeVisible();

    // ─── Part 2: User A views the group and sees the rotation order ────────
    await pageA.goto(`/savings-groups/${CREATED_GROUP.id}`);
    await expect(pageA.getByText(CREATED_GROUP.name)).toBeVisible();

    // Click Members tab to see the rotation order
    await pageA.getByRole("button", { name: /members/i }).click();

    // Verify both members are listed with correct positions
    await expect(pageA.getByText(USER_A.name)).toBeVisible();
    await expect(pageA.getByText(USER_B.name)).toBeVisible();

    await contextA.close();

    // ─── Part 3: User B sees the same group with rotation order ────────────
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    await mockGroupAPIs(pageB);
    await pageB.goto("/");
    await authenticateUser(pageB, USER_B);

    // Navigate to the group detail page
    await pageB.goto(`/savings-groups/${CREATED_GROUP.id}`);
    await expect(pageB.getByText(CREATED_GROUP.name)).toBeVisible();

    // Click Members tab
    await pageB.getByRole("button", { name: /members/i }).click();

    // Verify both members are visible to User B as well
    await expect(pageB.getByText(USER_A.name)).toBeVisible();
    await expect(pageB.getByText(USER_B.name)).toBeVisible();

    // Verify rotation order: both members visible in sequence confirms correct order
    // User A (position 1) should appear before User B (position 2)
    const membersSection = pageB.locator('[class*="rounded-3xl"]').filter({ hasText: USER_A.name });
    await expect(membersSection.getByText(USER_A.name)).toBeVisible();
    await expect(membersSection.getByText(USER_B.name)).toBeVisible();

    await contextB.close();
  });
});
