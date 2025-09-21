import { strict as assert } from "node:assert";
import { PLAN_LIMITS, isRowVisible, canUseFeature } from "../src/utils/plans";
import { fetchDashboardData } from "../src/lib/dashboard-api";

async function testPlanLimits() {
  assert.strictEqual(PLAN_LIMITS.free.visibleRows, 2, "Free plan should expose 2 rows");
  assert.strictEqual(PLAN_LIMITS.pro.visibleRows, 20, "Pro plan should expose 20 rows");
  assert.strictEqual(PLAN_LIMITS.elite.visibleRows, 50, "Elite plan should expose 50 rows");

  assert.ok(isRowVisible(1, "free"));
  assert.ok(!isRowVisible(2, "free"));
  assert.ok(isRowVisible(19, "pro"));
  assert.ok(!isRowVisible(25, "pro"));
  assert.ok(isRowVisible(40, "elite"));
}

async function testFeatureAccess() {
  assert.ok(!canUseFeature("free", "export"));
  assert.ok(canUseFeature("pro", "export"));
  assert.ok(canUseFeature("elite", "optimizedCV"));
}

async function testDashboardMasking() {
  const freeData = await fetchDashboardData({ plan: "free", range: "7d" });
  assert.strictEqual(freeData.jobs.length, 12, "Free plan should return 12 rows");
  const freeVisible = freeData.jobs.filter((job) => job.isVisible).length;
  assert.strictEqual(freeVisible, 2, "Free plan should only show 2 visible jobs");

  const proData = await fetchDashboardData({ plan: "pro", range: "7d" });
  assert.strictEqual(proData.jobs.length, 50, "Pro plan should return 50 rows");
  const proVisible = proData.jobs.filter((job) => job.isVisible).length;
  assert.strictEqual(proVisible, 20, "Pro plan should show 20 visible jobs");

  const eliteData = await fetchDashboardData({ plan: "elite", range: "7d" });
  assert.strictEqual(eliteData.jobs.length, 50, "Elite plan should return 50 rows");
  const eliteMasked = eliteData.jobs.filter((job) => job.isMasked).length;
  assert.strictEqual(eliteMasked, 0, "Elite plan should not mask jobs");
}

async function run() {
  await testPlanLimits();
  await testFeatureAccess();
  await testDashboardMasking();
  console.log("Plan gating QA tests passed");
}

run().catch((error) => {
  console.error("Plan gating QA tests failed", error);
  process.exitCode = 1;
});
