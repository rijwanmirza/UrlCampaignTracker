/**
 * Fixed storage.ts methods to properly handle URLs with unlimited clicks (clickLimit = 0)
 * 
 * This file contains the corrected versions of the methods from server/storage.ts
 * Copy and replace the methods in storage.ts with these implementations
 */

// Fix 1: Update the getUrls method to properly handle URLs with clickLimit = 0

async getUrls(campaignId: number, forceRefresh: boolean = false): Promise<UrlWithActiveStatus[]> {
  // Check cache first for performance
  const cacheKey = campaignId;
  const cachedItem = this.campaignUrlsCache.get(cacheKey);
  
  if (!forceRefresh && cachedItem && (this.cacheTTL < 0 || Date.now() - cachedItem.timestamp < this.cacheTTL)) {
    // Cache hit
    return cachedItem.urls;
  }
  
  // Cache miss - fetch from database
  const urlsResult = await db
    .select()
    .from(urls)
    .where(eq(urls.campaignId, campaignId))
    .orderBy(desc(urls.createdAt));
  
  // Calculate active status for each URL
  const urlsWithStatus: UrlWithActiveStatus[] = urlsResult.map(url => {
    const isActive = url.status === "active";
    
    // Check if URL has reached its click limit
    // Note: clickLimit of 0 means unlimited clicks
    let limitReached = false;
    if (isActive && url.clickLimit !== null && url.clickLimit > 0 && url.clicks >= url.clickLimit) {
      limitReached = true;
    }
    
    return {
      ...url,
      activeStatus: limitReached ? 'limit-reached' : (isActive ? 'active' : 'inactive'),
      originalClickLimit: url.originalClickLimit || url.clickLimit
    };
  });
  
  // Update cache
  this.campaignUrlsCache.set(cacheKey, {
    timestamp: Date.now(),
    urls: urlsWithStatus
  });
  
  return urlsWithStatus;
}

// Fix 2: Update the getWeightedUrlDistribution method to properly filter active URLs

async getWeightedUrlDistribution(campaignId: number) {
  // Get all active URLs for this campaign
  const allUrls = await this.getUrls(campaignId, true);
  
  // Filter for active URLs with weight > 0
  // A URL is considered active if:
  // 1. Its status is "active"
  // 2. Its weight is > 0
  // 3. Either it has unlimited clicks (clickLimit = 0) OR it hasn't reached its click limit
  const activeUrls = allUrls.filter(url => 
    url.status === "active" && 
    url.weight > 0 && 
    (url.clickLimit === 0 || url.clickLimit === null || url.clicks < url.clickLimit)
  );
  
  // If no active URLs, return empty result
  if (!activeUrls.length) {
    return {
      activeUrls: [],
      weightedDistribution: []
    };
  }
  
  // Calculate total weight
  const totalWeight = activeUrls.reduce((sum, url) => sum + url.weight, 0);
  
  // Create weighted distribution
  const weightedDistribution = [];
  let currentRange = 0;
  
  for (const url of activeUrls) {
    const relativeWeight = url.weight / totalWeight;
    const rangePortion = Math.round(relativeWeight * 10000); // Use 10000 for precise distribution
    
    weightedDistribution.push({
      url,
      weight: relativeWeight,
      startRange: currentRange,
      endRange: currentRange + rangePortion - 1
    });
    
    currentRange += rangePortion;
  }
  
  return {
    activeUrls,
    weightedDistribution
  };
}

// Fix 3: Update the getRandomWeightedUrl method to properly handle unlimited click limits

async getRandomWeightedUrl(campaignId: number): Promise<UrlWithActiveStatus | null> {
  const { activeUrls, weightedDistribution } = await this.getWeightedUrlDistribution(campaignId);
  
  // If no active URLs, return null
  if (!activeUrls.length) {
    return null;
  }
  
  // If only one active URL, return it directly
  if (activeUrls.length === 1) {
    return activeUrls[0];
  }
  
  // Pick a random number in the range
  const totalRange = weightedDistribution.reduce((max, item) => 
    item.endRange > max ? item.endRange : max, 0);
  
  const randomValue = Math.floor(Math.random() * (totalRange + 1));
  
  // Find the URL that contains this random value in its range
  const selectedDistribution = weightedDistribution.find(
    item => randomValue >= item.startRange && randomValue <= item.endRange
  );
  
  if (selectedDistribution) {
    // No need to check if the URL has reached its click limit here
    // because we've already filtered those in getWeightedUrlDistribution
    return selectedDistribution.url;
  }
  
  // Fallback to first URL if something goes wrong
  return activeUrls[0];
}