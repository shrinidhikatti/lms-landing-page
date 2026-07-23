const express = require("express");
const prisma = require("../db");
const { createOrder, verifyPaymentSignature } = require("../services/razorpay");
const { sendWhatsappConfirmation } = require("../services/whatsapp");
const { upsertFunnelRow, upsertConfirmedRow } = require("../services/sheets");

const router = express.Router();

router.post("/create-order", async (req, res) => {
  const { leadId } = req.body || {};
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const amountPaise = Number(process.env.MASTERCLASS_PRICE_PAISE || 9900);
  const order = await createOrder({ leadId, amountPaise });

  await prisma.lead.update({
    where: { id: leadId },
    data: { razorpayOrderId: order.id, status: "payment_initiated" },
  });

  upsertFunnelRow({
    sessionId: lead.id,
    name: lead.name,
    mobile: lead.mobile,
    stage: "payment_initiated",
    orderId: order.id,
  }).catch((err) => console.error("Sheets funnel sync failed:", err.message));

  res.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
  });
});

async function markPaid({ leadId, paymentId }) {
  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { status: "paid", razorpayPaymentId: paymentId },
  });

  upsertFunnelRow({
    sessionId: lead.id,
    name: lead.name,
    mobile: lead.mobile,
    stage: "paid",
    orderId: lead.razorpayOrderId,
    paymentId,
  }).catch((err) => console.error("Sheets funnel sync failed:", err.message));

  upsertConfirmedRow({
    sessionId: lead.id,
    name: lead.name,
    mobile: lead.mobile,
    orderId: lead.razorpayOrderId,
    paymentId,
  }).catch((err) => console.error("Sheets confirmed sync failed:", err.message));

  try {
    await sendWhatsappConfirmation({ mobile: lead.mobile, name: lead.name, paymentId });
    await prisma.lead.update({ where: { id: leadId }, data: { whatsappSentAt: new Date() } });
  } catch (err) {
    // Payment already succeeded; a WhatsApp failure shouldn't fail the request.
    console.error("WhatsApp send failed:", err.message);
  }

  return lead;
}

router.post("/verify", async (req, res) => {
  const { leadId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!leadId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment verification fields" });
  }

  const valid = verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });
  if (!valid) return res.status(400).json({ error: "Invalid payment signature" });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  if (lead.status !== "paid") {
    await markPaid({ leadId, paymentId: razorpay_payment_id });
  }

  res.json({ success: true });
});

module.exports = router;
module.exports.markPaid = markPaid;
