const MSG91_URL = "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

// Sends the MSG91 template library template "appointment_confirmed":
//   Hi {{1}}, Your appointment is scheduled for {{2}}. Service: {{3}}
//   Confirmation number: {{4}}. We're looking forward to your visit.
// Mapped here as: name, event date/time, masterclass name, short payment ref.
async function sendWhatsappConfirmation({ mobile, name, paymentId }) {
  const eventDateTime = process.env.MASTERCLASS_EVENT_DATETIME || "17/07/2026, 8:00 PM";
  const confirmationRef = (paymentId || "").slice(-6).toUpperCase() || "PENDING";

  const payload = {
    integrated_number: process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: process.env.MSG91_WHATSAPP_TEMPLATE_NAME,
        language: { code: "en", policy: "deterministic" },
        namespace: process.env.MSG91_WHATSAPP_NAMESPACE,
        to_and_components: [
          {
            to: [`91${mobile}`],
            components: {
              body_1: { type: "text", value: name },
              body_2: { type: "text", value: eventDateTime },
              body_3: { type: "text", value: "Live Vastu Masterclass with Sachin Joshi" },
              body_4: { type: "text", value: confirmationRef },
            },
          },
        ],
      },
    },
  };

  const res = await fetch(MSG91_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: process.env.MSG91_AUTH_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MSG91 send failed (${res.status}): ${text}`);
  }
  return res.json();
}

module.exports = { sendWhatsappConfirmation };
