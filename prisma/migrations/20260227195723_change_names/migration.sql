/*
  Warnings:

  - You are about to drop the column `color` on the `Category` table. All the data in the column will be lost.
  - You are about to drop the column `icon` on the `Category` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Category" DROP COLUMN "color",
DROP COLUMN "icon",
ADD COLUMN     "colorKey" TEXT,
ADD COLUMN     "iconKey" TEXT;
