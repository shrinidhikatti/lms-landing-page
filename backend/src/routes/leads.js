const express = require("express");
const prisma = require("../db");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

// Public: called from the popup form before payment starts.
router.post("/", async (req, res) => {
  const { name, mobile } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!mobile || !/^\d{10}$/.test(mobile)) {
    return res.status(400).json({ error: "A valid 10-digit mobile number is required" });
  }

  const lead = await prisma.lead.create({
    data: { name: name.trim(), mobile },
  });

  res.status(201).json({ leadId: lead.id });
});

// Admin only: list registrations, optionally filtered by status.
router.get("/", adminAuth, async (req, res) => {
  const { status } = req.query;
  const leads = await prisma.lead.findMany({
    where: status ? { status: String(status) } : undefined,
    orderBy: { createdAt: "desc" },
  });
  res.json(leads);
});

module.exports = router;
