import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeAndCacheClusters,
  loadContributionClusters,
  loadPublicContributionClusters,
  publicContributionMetadata,
  publicInventoryMetadata,
} from "../lib/contribution-map";

const realCluster = {
  id: "db-cluster-1",
  title: "Verified Robotics Lab",
  organization: "Verified University",
  locationLabel: "Bangkok, Thailand",
  latitude: 13.7,
  longitude: 100.5,
  summary: "Derived from actual database contributions.",
  contributorType: "University",
  contributionCount: 1,
  detailsList: ["Verified contribution"]
};

test("uses existing cached contribution clusters without reanalysis", async () => {
  let analyses = 0;
  let writes = 0;
  const result = await loadContributionClusters(
    async () => [realCluster],
    async () => { analyses += 1; return []; },
    async () => { writes += 1; }
  );

  assert.deepEqual(result, [realCluster]);
  assert.equal(analyses, 0);
  assert.equal(writes, 0);
});

test("returns no clusters and does not cache when analysis fails", async () => {
  let writes = 0;
  const result = await loadContributionClusters(
    async () => null,
    async () => { throw new Error("Gemini unavailable"); },
    async () => { writes += 1; }
  );

  assert.deepEqual(result, []);
  assert.equal(writes, 0);
});

test("keeps successful analysis results and caches those exact records", async () => {
  let cached: typeof realCluster[] | undefined;
  const result = await loadContributionClusters(
    async () => null,
    async () => [realCluster],
    async (clusters) => { cached = clusters; }
  );

  assert.deepEqual(result, [realCluster]);
  assert.deepEqual(cached, [realCluster]);
});

test("refresh failure leaves the existing cache untouched and returns no substitute rows", async () => {
  let cached = [realCluster];
  const result = await analyzeAndCacheClusters<typeof realCluster>(
    async () => { throw new Error("Gemini unavailable"); },
    async (clusters) => { cached = clusters; }
  );

  assert.deepEqual(result, []);
  assert.deepEqual(cached, [realCluster]);
});

test("public map cache miss returns an empty result without starting analysis", async () => {
  let reads = 0;
  const result = await loadPublicContributionClusters(async () => {
    reads += 1;
    return null;
  });
  assert.deepEqual(result, []);
  assert.equal(reads, 1);
});

test("provider metadata omits contributor identity and inventory custodian notes", () => {
  assert.deepEqual(publicContributionMetadata([{
    id: "c1", title: "Robotics paper", description: "Public research", organization: "Public University",
    contributorName: "Private Person", contributionType: "paper",
  }]), [{
    type: "contribution", id: "c1", title: "Robotics paper", description: "Public research",
    org: "Public University", contribType: "paper",
  }]);
  assert.deepEqual(publicInventoryMetadata([{
    id: "i1", displayName: "Demo robot", ownerOrg: "Public Lab", locationLabel: "Bangkok",
    custodian: "Private Person", notes: "Private note",
  }]), [{
    type: "owned_inventory", id: "i1", name: "Demo robot", org: "Public Lab", location: "Bangkok",
  }]);
});
