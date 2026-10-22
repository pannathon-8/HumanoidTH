type ClusterAnalysis<T> = () => Promise<T[]>;
type ClusterCacheRead<T> = () => Promise<unknown>;
type ClusterCacheWrite<T> = (clusters: T[]) => Promise<void>;

type ContributionMetadataInput = {
  id: string; title: string; description: string | null; organization: string | null;
  contributorName?: string | null; contributionType: string;
};

type InventoryMetadataInput = {
  id: string; displayName: string; ownerOrg: string | null; locationLabel: string | null;
  custodian?: string | null; notes?: string | null;
};

export function publicContributionMetadata(items: ContributionMetadataInput[]) {
  return items.map((item) => ({
    type: "contribution",
    id: item.id,
    title: item.title,
    description: item.description,
    org: item.organization,
    contribType: item.contributionType,
  }));
}

export function publicInventoryMetadata(items: InventoryMetadataInput[]) {
  return items.map((item) => ({
    type: "owned_inventory",
    id: item.id,
    name: item.displayName,
    org: item.ownerOrg,
    location: item.locationLabel,
  }));
}

export async function loadPublicContributionClusters<T>(readCache: ClusterCacheRead<T>): Promise<T[]> {
  try {
    const cached = await readCache();
    return Array.isArray(cached) ? cached as T[] : [];
  } catch (error) {
    console.error("Contribution map cache read failed:", error);
    return [];
  }
}

export async function analyzeAndCacheClusters<T>(
  analyze: ClusterAnalysis<T>,
  writeCache: ClusterCacheWrite<T>
): Promise<T[]> {
  let clusters: T[];
  try {
    clusters = await analyze();
  } catch (error) {
    console.error("Contribution map analysis failed:", error);
    return [];
  }

  try {
    await writeCache(clusters);
  } catch (error) {
    // A cache outage should not discard fresh results from successful analysis.
    console.error("Contribution map cache write failed:", error);
  }
  return clusters;
}

export async function loadContributionClusters<T>(
  readCache: ClusterCacheRead<T>,
  analyze: ClusterAnalysis<T>,
  writeCache: ClusterCacheWrite<T>
): Promise<T[]> {
  try {
    const cached = await readCache();
    if (Array.isArray(cached)) return cached as T[];
  } catch (error) {
    console.error("Contribution map cache read failed:", error);
  }

  return analyzeAndCacheClusters(analyze, writeCache);
}
