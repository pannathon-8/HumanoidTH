type ClusterAnalysis<T> = () => Promise<T[]>;
type ClusterCacheRead<T> = () => Promise<unknown>;
type ClusterCacheWrite<T> = (clusters: T[]) => Promise<void>;

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
