const prisma = require("../db");
const { getOrCreatePaymentLink } = require("../routes/payment");
const { sendPaymentReminder } = require("../services/whatsapp");

const CHECK_INTERVAL_MS = 30 * 1000;
const REMINDER_DELAY_MS = 2 * 60 * 1000;

// Only leads created after this process started are eligible - the existing
// backlog of older unpaid leads is handled separately as a one-time bulk
// send, not by this job, so it must never sweep them in.
const JOB_START_TIME = new Date();

async function processDueReminders() {
  if (!process.env.MSG91_WHATSAPP_REMINDER_TEMPLATE_NAME) return;

  const dueLeads = await prisma.lead.findMany({
    where: {
      status: { not: "paid" },
      reminderSentAt: null,
      createdAt: { gte: JOB_START_TIME, lte: new Date(Date.now() - REMINDER_DELAY_MS) },
    },
  });

  for (const lead of dueLeads) {
    try {
      const paymentLinkUrl = await getOrCreatePaymentLink(lead);
      await sendPaymentReminder({ mobile: lead.mobile, paymentLinkUrl });
      await prisma.lead.update({ where: { id: lead.id }, data: { reminderSentAt: new Date() } });
    } catch (err) {
      console.error(`Payment reminder failed for lead ${lead.id}:`, err.message || JSON.stringify(err));
    }
  }
}

function start() {
  setInterval(() => {
    processDueReminders().catch((err) => console.error("Payment reminder job failed:", err.message));
  }, CHECK_INTERVAL_MS);
}

module.exports = { start };
