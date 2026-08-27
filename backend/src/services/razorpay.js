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

// Payment Links surface the same "payment.captured" webhook event as Orders
// (with notes.leadId carried through to the underlying payment), so the
// existing webhook handler in index.js marks the lead paid automatically.
async function createPaymentLink({ leadId, name, mobile, amountPaise, callbackUrl }) {
  return razorpay.paymentLink.create({
    amount: amountPaise,
    currency: "INR",
    accept_partial: false,
    reference_id: leadId,
    description: "Vastu Masterclass Registration",
    customer: { name, contact: `+91${mobile}` },
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: { leadId },
    callback_url: callbackUrl,
    callback_method: "get",
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

module.exports = { createOrder, createPaymentLink, verifyPaymentSignature, verifyWebhookSignature };
