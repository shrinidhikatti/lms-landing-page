const MSG91_URL = "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

// Meta rejects any BODY text parameter over 30 characters (silently, with no
// "Sent At" and no charge — looks identical to an account-level failure).
// Truncating here is a safety net so unexpected long values (e.g. a very
// long customer name) can't reintroduce this failure mode.
function toParam(value) {
  return String(value).slice(0, 30);
}

// Sends the MSG91 WhatsApp template configured via MSG91_WHATSAPP_TEMPLATE_NAME.
// Default (template 1) is "shri_v_m_joshi", a text-only-header template:
//   Hi {{1}}, Your appointment is scheduled for {{2}}. Service: {{3}}
//   Confirmation number: {{4}}.
// Mapped here as: name, event date/time, masterclass name, short payment ref.
// MSG91's dashboard-managed templates don't use the old Meta WABA namespace
// system, so namespace is sent as null (confirmed working via a live test).
//
// Template 2 (image header, e.g. Sachin's photo) is an opt-in switch: set
// MSG91_WHATSAPP_HEADER_IMAGE_URL to a publicly reachable JPEG/PNG URL and
// point MSG91_WHATSAPP_TEMPLATE_NAME at the new approved template name.
// Leave MSG91_WHATSAPP_HEADER_IMAGE_URL blank to keep using template 1 -
// this is the safe fallback if template 2 gets rejected by Meta or needs to
// be reverted, no code change required, just the env vars.
// NOTE: MSG91 support confirmed the image header needs a nested "link"
// (matching WhatsApp's own template component format: { type: "image",
// image: { link: <url> } }), unlike the flat { type, value } shape used for
// text body params. Still worth a live test once template 2 actually exists
// and is approved - MSG91's example wasn't for this exact bulk API shape.
//
// Template 3 ("welcome" variant) has a different image (Joshi Institute
// branded welcome graphic), an entirely different static body wrapped
// around a single {{1}} name variable, and a static-URL "Join Community"
// button (static URL buttons need no component in this payload at all -
// they're baked into the approved template and render automatically).
// Set MSG91_WHATSAPP_TEMPLATE_VARIANT=welcome + point
// MSG91_WHATSAPP_TEMPLATE_NAME/MSG91_WHATSAPP_HEADER_IMAGE_URL at the new
// template/image to switch; leave the variant unset to keep template 1/2
// behavior (4 body params) untouched.
async function sendWhatsappConfirmation({ mobile, name, paymentId }) {
  const variant = process.env.MSG91_WHATSAPP_TEMPLATE_VARIANT || "text";
  const eventDateTime = process.env.MASTERCLASS_EVENT_DATETIME || "07/08/2026, 8:00 PM";
  const confirmationRef = (paymentId || "").slice(-6).toUpperCase() || "PENDING";
  const headerImageUrl = process.env.MSG91_WHATSAPP_HEADER_IMAGE_URL || "";

  const components =
    variant === "welcome"
      ? { body_1: { type: "text", value: toParam(name) } }
      : {
          body_1: { type: "text", value: toParam(name) },
          body_2: { type: "text", value: toParam(eventDateTime) },
          body_3: { type: "text", value: "Live Vastu Masterclass" },
          body_4: { type: "text", value: toParam(confirmationRef) },
        };
  if (headerImageUrl) {
    components.header_1 = { type: "image", image: { link: headerImageUrl } };
  }

  const payload = {
    integrated_number: process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: process.env.MSG91_WHATSAPP_TEMPLATE_NAME,
        language: { code: "en", policy: "deterministic" },
        namespace: null,
        to_and_components: [
          {
            to: [`91${mobile}`],
            components,
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

// Sends the "still hasn't paid" reminder, fired ~2 min after a lead is
// created if they haven't completed payment. Template needs a "Dynamic URL"
// button with base URL https://rzp.io/rzp/ (confirmed against a real
// Payment Link created in this Razorpay account - short_url format is
// https://rzp.io/rzp/<code>) with a {{1}} variable appended; only the
// "<code>" suffix is sent as button_1 here.
async function sendPaymentReminder({ mobile, name, paymentLinkUrl }) {
  const headerImageUrl = process.env.MSG91_WHATSAPP_REMINDER_HEADER_IMAGE_URL || "";
  const buttonSuffix = paymentLinkUrl.slice(paymentLinkUrl.lastIndexOf("/") + 1);

  const components = {
    body_1: { type: "text", value: toParam(name) },
    button_1: { type: "text", subtype: "url", value: buttonSuffix },
  };
  if (headerImageUrl) {
    components.header_1 = { type: "image", image: { link: headerImageUrl } };
  }

  const payload = {
    integrated_number: process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: process.env.MSG91_WHATSAPP_REMINDER_TEMPLATE_NAME,
        language: { code: "en", policy: "deterministic" },
        namespace: null,
        to_and_components: [
          {
            to: [`91${mobile}`],
            components,
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
    throw new Error(`MSG91 reminder send failed (${res.status}): ${text}`);
  }
  return res.json();
}

module.exports = { sendWhatsappConfirmation, sendPaymentReminder };
