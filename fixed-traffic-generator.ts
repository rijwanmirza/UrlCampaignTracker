// Here we'll put our fixed code snippets:

// Snippet 1: First occurrence (around line 362):
const campaign = await db.query.campaigns.findFirst({
  where: (campaign, { eq }) => eq(campaign.id, campaignId),
  with: {
    urls: {
      where: (urls, { eq }) => eq(urls.status, 'active')
    }
  }
}) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;

// Snippet 2: Second occurrence (around line 442):
const campaign = await db.query.campaigns.findFirst({
  where: (campaign, { eq }) => eq(campaign.id, campaignId),
  with: {
    urls: {
      where: (urls, { eq }) => eq(urls.status, 'active')
    }
  }
}) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;

// Snippet 3: Third occurrence (around line 558):
const campaign = await db.query.campaigns.findFirst({
  where: (campaign, { eq }) => eq(campaign.id, campaignId),
  with: {
    urls: {
      where: (urls, { eq }) => eq(urls.status, 'active')
    }
  }
}) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;

// Snippet 4: Fourth occurrence (around line 657):
const campaign = await db.query.campaigns.findFirst({
  where: (campaign, { eq }) => eq(campaign.id, campaignId),
  with: {
    urls: {
      where: (urls, { eq }) => eq(urls.status, 'active')
    }
  }
}) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;

// Snippet 5: Fifth occurrence (around line 758):
const campaign = await db.query.campaigns.findFirst({
  where: (campaign, { eq }) => eq(campaign.id, campaignId),
  with: {
    urls: {
      where: (urls, { eq }) => eq(urls.status, 'active')
    }
  }
}) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;

// Snippet 6: Sixth occurrence (around line 909):
const campaign = await db.query.campaigns.findFirst({
  where: (campaign, { eq }) => eq(campaign.id, campaignId),
  with: {
    urls: {
      where: (urls, { eq }) => eq(urls.status, 'active')
    }
  }
}) as (Campaign & { urls: UrlWithActiveStatus[] }) | null;