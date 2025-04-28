// Fixed getUrls method implementation
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
