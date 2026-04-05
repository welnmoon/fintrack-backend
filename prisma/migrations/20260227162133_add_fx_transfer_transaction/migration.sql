/*
  Warnings:

  - You are about to drop the column `amount` on the `Transfer` table. All the data in the column will be lost.
  - Added the required column `exchangeRate` to the `Transfer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fromAmount` to the `Transfer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `toAmount` to the `Transfer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "exchangeRate" DECIMAL(18,8),
ADD COLUMN     "originalAmount" DECIMAL(18,2),
ADD COLUMN     "originalCurrency" "Currency";

-- AlterTable
ALTER TABLE "Transfer" DROP COLUMN "amount",
ADD COLUMN     "exchangeRate" DECIMAL(18,8) NOT NULL,
ADD COLUMN     "fromAmount" DECIMAL(18,2) NOT NULL,
ADD COLUMN     "toAmount" DECIMAL(18,2) NOT NULL;
