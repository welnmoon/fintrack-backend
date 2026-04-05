-- CreateEnum
CREATE TYPE "Emotion" AS ENUM ('NEUTRAL', 'HAPPY', 'IMPULSIVE', 'STRESS', 'REGRET');

-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "emotion" "Emotion";

-- CreateIndex
CREATE INDEX "Transaction_userId_emotion_idx" ON "Transaction"("userId", "emotion");
