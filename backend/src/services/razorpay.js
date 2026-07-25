const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function createOrder({ leadId, amountPaise }) {
  return razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    // Razorpay caps receipt at 40 chars; a UUID alone (36 chars) fits, "lead_" + UUID (41) doesn't.
    receipt: leadId,
    notes: { leadId },
  });
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}

function verifyWebhookSignature({ rawBody, signature }) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}

module.exports = { createOrder, verifyPaymentSignature, verifyWebhookSignature };
