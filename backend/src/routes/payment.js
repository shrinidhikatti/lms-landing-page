const express = require("express");
const prisma = require("../db");
const adminAuth = require("../middleware/adminAuth");
const { createOrder, createPaymentLink, verifyPaymentSignature } = require("../services/razorpay");
const { sendWhatsappConfirmation } = require("../services/whatsapp");
const { upsertFunnelRow, upsertConfirmedRow } = require("../services/sheets");

const router = express.Router();

router.post("/create-order", async (req, res, next) => {
  try {
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
  } catch (err) {
    console.error("create-order failed:", JSON.stringify(err, null, 2));
    next(err);
  }
});

// Shared by the admin GET route below and the auto-reminder job -
// returns the lead's cached payment link, creating one on first use.
async function getOrCreatePaymentLink(lead) {
  if (lead.paymentLinkUrl) return lead.paymentLinkUrl;

  const amountPaise = Number(process.env.MASTERCLASS_PRICE_PAISE || 9900);
  const frontendOrigin = (process.env.FRONTEND_ORIGIN || "").split(",")[0].trim();
  // The site is served from /vastu-workshop/ on Hostinger, not the domain root.
  const link = await createPaymentLink({
    leadId: lead.id,
    name: lead.name,
    mobile: lead.mobile,
    amountPaise,
    callbackUrl: `${frontendOrigin}/vastu-workshop/thank-you.html?name=${encodeURIComponent(lead.name)}&amount=${amountPaise / 100}`,
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      razorpayPaymentLinkId: link.id,
      paymentLinkUrl: link.short_url,
      status: lead.status === "lead" ? "payment_initiated" : lead.status,
    },
  });

  return link.short_url;
}

// Admin only: fetch (or lazily create) a personalized Razorpay Payment Link
// for a lead who hasn't paid yet, for the WhatsApp payment-reminder flow.
router.get("/link/:leadId", adminAuth, async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.leadId } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (lead.status === "paid") return res.status(409).json({ error: "Lead already paid" });

    const url = await getOrCreatePaymentLink(lead);
    res.json({ url });
  } catch (err) {
    console.error("payment-link failed:", JSON.stringify(err, null, 2));
    next(err);
  }
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

router.post("/verify", async (req, res, next) => {
  try {
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
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.markPaid = markPaid;
module.exports.getOrCreatePaymentLink = getOrCreatePaymentLink;
