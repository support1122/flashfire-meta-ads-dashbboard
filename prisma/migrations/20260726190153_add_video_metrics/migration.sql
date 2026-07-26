-- AlterTable
ALTER TABLE "Insight" ADD COLUMN     "thruPlays" INTEGER,
ADD COLUMN     "videoAvgWatchSec" DOUBLE PRECISION,
ADD COLUMN     "videoP100" INTEGER,
ADD COLUMN     "videoP25" INTEGER,
ADD COLUMN     "videoP50" INTEGER,
ADD COLUMN     "videoP75" INTEGER,
ADD COLUMN     "videoPlays" INTEGER;
