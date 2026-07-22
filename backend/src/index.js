require("dotenv").config();
const express = require("express");
const cors = require("cors");

const prisma = require("./db");
const { verifyWebhookSignature } = require("./services/razorpay");

const leadsRouter = require("./routes/leads");
const paymentRouter = require("./routes/payment");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN }));

// Razorpay webhook needs the raw request body to verify its signature,
// so it's registered before the global express.json() body parser below.
// This is a backup path in case the browser never reaches /api/payment/verify.
app.post("/api/payment/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  const signature = req.get("x-razorpay-signature") || "";
  const valid = verifyWebhookSignature({ rawBody: req.body, signature });
  if (!valid) return res.status(400).json({ error: "Invalid webhook signature" });

  const event = JSON.parse(req.body.toString("utf8"));
  if (event.event === "payment.captured") {
    const payment = event.payload.payment.entity;
    const leadId = payment.notes?.leadId;
    if (leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (lead && lead.status !== "paid") {
        await paymentRouter.markPaid({ leadId, paymentId: payment.id });
      }
    }
  }

  res.json({ received: true });
});

app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/leads", leadsRouter);
app.use("/api/payment", paymentRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Backend listening on port ${port}`));
