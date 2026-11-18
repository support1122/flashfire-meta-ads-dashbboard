-- CreateTable
CREATE TABLE "GoogleCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "channelType" TEXT,
    "biddingStrategyType" TEXT,
    "dailyBudget" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleInsight" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPerConversion" DOUBLE PRECISION,
    "allConversions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interactions" INTEGER NOT NULL DEFAULT 0,
    "videoViews" INTEGER NOT NULL DEFAULT 0,
    "searchImpressionShare" DOUBLE PRECISION,
    "searchBudgetLostIS" DOUBLE PRECISION,
    "searchRankLostIS" DOUBLE PRECISION,
    "searchTopIS" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleAdGroup" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT,
    "cpcBid" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleAdGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleAd" (
    "id" TEXT NOT NULL,
    "adGroupId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT,
    "type" TEXT,
    "status" TEXT NOT NULL,
    "finalUrls" TEXT[],
    "headlines" TEXT[],
    "descriptions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleKeyword" (
    "id" TEXT NOT NULL,
    "adGroupId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "negative" BOOLEAN NOT NULL DEFAULT false,
    "qualityScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleStat" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adGroupId" TEXT,
    "entityId" TEXT,
    "dim1" TEXT,
    "dim2" TEXT,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allConversions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interactions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleInsight_campaignId_date_idx" ON "GoogleInsight"("campaignId", "date");

-- CreateIndex
CREATE INDEX "GoogleInsight_date_idx" ON "GoogleInsight"("date");

-- CreateIndex
CREATE INDEX "GoogleAdGroup_campaignId_idx" ON "GoogleAdGroup"("campaignId");

-- CreateIndex
CREATE INDEX "GoogleAd_adGroupId_idx" ON "GoogleAd"("adGroupId");

-- CreateIndex
CREATE INDEX "GoogleAd_campaignId_idx" ON "GoogleAd"("campaignId");

-- CreateIndex
CREATE INDEX "GoogleKeyword_campaignId_idx" ON "GoogleKeyword"("campaignId");

-- CreateIndex
CREATE INDEX "GoogleKeyword_adGroupId_idx" ON "GoogleKeyword"("adGroupId");

-- CreateIndex
CREATE INDEX "GoogleStat_level_date_idx" ON "GoogleStat"("level", "date");

-- CreateIndex
CREATE INDEX "GoogleStat_level_campaignId_date_idx" ON "GoogleStat"("level", "campaignId", "date");

-- AddForeignKey
ALTER TABLE "GoogleInsight" ADD CONSTRAINT "GoogleInsight_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "GoogleCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

