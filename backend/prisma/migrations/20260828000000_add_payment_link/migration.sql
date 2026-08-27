-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "razorpayPaymentLinkId" TEXT,
ADD COLUMN "paymentLinkUrl" TEXT,
ADD COLUMN "reminderSentAt" TIMESTAMP(3);
