import { Resend } from "resend";
import { brand } from "@/config/brand";
import { env } from "./env";
import { PROTECTION_LABEL } from "./addons";
import { carrierLabel, trackingUrl } from "./fulfilment";
import { formatMoney } from "./money";
import { confirmed } from "./placeholder";
import { publicSiteUrl } from "./site-url";
import type { Order } from "./store/types";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export function getMailer(): Mailer | null {
  if (!env.resendApiKey || !env.emailFrom) return null;
  const resend = new Resend(env.resendApiKey);
  const from = env.emailFrom;
  const replyTo = confirmed(brand.contact.email) ?? undefined;
  return {
    async send(m) {
      const { error } = await resend.emails.send({ from, replyTo, to: m.to, subject: m.subject, html: m.html, text: m.text });
      if (error) throw new Error(`email failed: ${error.message}`);
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, body: string, footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#f9f7f3;font-family:Manrope,Helvetica,Arial,sans-serif;color:#30263a">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr>
<td style="padding-right:12px;vertical-align:middle"><img src="${esc(publicSiteUrl())}/email-logo.png" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px"></td>
<td style="font-size:22px;font-weight:800;vertical-align:middle">${esc(brand.name)}</td>
</tr></table>
<div style="background:#fff;border-radius:20px;padding:28px">
<h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>${body}</div>
<p style="font-size:12px;color:#746c78;line-height:1.5;margin-top:24px">${footer}</p>
</div></body></html>`;
}

function sender() {
  const name = confirmed(brand.legal.businessName) ?? brand.name;
  const address = confirmed(brand.legal.mailingAddress);
  return address ? `${name}, ${address}` : name;
}

export function orderConfirmationEmail(order: Order): Mail {
  const money = (amount: number) => formatMoney({ amount, currency: order.currency });
  const lines = [
    ...order.items.map((i) => `${i.qty} × ${i.name} — ${money(i.unitAmount * i.qty)}`),
    ...(order.protectionAmount ? [`${PROTECTION_LABEL} — ${money(order.protectionAmount)}`] : []),
    ...(order.shippingAmount !== undefined ? [`Shipping — ${money(order.shippingAmount)}`] : []),
    ...(order.tipAmount ? [`Tip — ${money(order.tipAmount)}. Thank you!`] : []),
  ];
  const total = money(order.amountTotal ?? order.subtotal);
  const pre = order.fulfilment === "preorder";
  const note = pre
    ? "This is a pre-order: your Lumi ships when its launch is ready. We'll email you before it does."
    : "We'll email you again when your order ships.";
  const text = [`Thanks for your order!`, ``, ...lines, ``, `Total paid: ${total}`, ``, note, ``, `Order reference: ${order.id}`, ``, sender()].join("\n");
  const html = layout(
    "Thanks for your order",
    `<ul style="padding-left:18px;line-height:1.7">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<p><b>Total paid:</b> ${esc(total)}</p><p>${esc(note)}</p>
<p style="font-size:13px;color:#746c78">Order reference: ${esc(order.id)}</p>`,
    esc(sender()),
  );
  return { to: order.email ?? "", subject: pre ? `Your ${brand.name} pre-order is confirmed` : `Your ${brand.name} order is confirmed`, html, text };
}

/**
 * The Lumi names from the admin's "Lumi(s) packed" box, ready for the customer:
 * serials and anything in brackets dropped, several names split on commas.
 */
export function lumiNames(unitNames?: string | null): string[] {
  if (!unitNames) return [];
  return unitNames
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\bLUMI-\d+\b/gi, " ")
    .split(/[,;\n]/)
    .map((n) => n.replace(/\s+/g, " ").trim())
    .filter((n) => n.length > 0 && n.length <= 40)
    .slice(0, 10);
}

const listOf = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** "Starla is on their way!", "Starla and Pip are on their way!" */
export const shippedHeading = (names: string[]) => `${listOf(names)} ${names.length === 1 ? "is" : "are"} on their way!`;

export function orderShippedEmail(order: Order, opts: { includeNames?: boolean } = {}): Mail {
  const lines = order.items.map((i) => `${i.qty} × ${i.name}`);
  const carrier = order.carrier && order.carrier !== "other" ? carrierLabel(order.carrier) : null;
  const url = trackingUrl(order.carrier, order.trackingNumber);
  const tracking = order.trackingNumber
    ? `Tracking number${carrier ? ` (${carrier})` : ""}: ${order.trackingNumber}`
    : carrier ? `It's on its way with ${carrier}.` : "It's on its way.";
  const names = opts.includeNames ? lumiNames(order.unitNames) : [];
  const who = listOf(names);
  const one = names.length === 1;
  const heading = names.length ? shippedHeading(names) : "Your order is on its way!";
  const intro = names.length ? `${who} ${one ? "has" : "have"} left the nest and ${one ? "is" : "are"} on their way to you.` : null;
  const wake = "Your Lumi travels asleep, so bumps in the post can't wake it. When it arrives, tap its screen three times to wake it up.";
  const text = [
    heading,
    ``,
    ...(intro ? [intro, ``] : []),
    ...lines,
    ``,
    tracking,
    ...(url ? [`Track it: ${url}`] : []),
    ``,
    wake,
    ``,
    `Order reference: ${order.id}`,
    ``,
    sender(),
  ].join("\n");
  const html = layout(
    heading.replace(/!$/, ""),
    `${intro ? `<p>${esc(intro)}</p>
` : ""}<ul style="padding-left:18px;line-height:1.7">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<p>${esc(tracking)}</p>
${url ? `<p><a href="${esc(url)}" style="display:inline-block;background:#30263a;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Track your parcel</a></p>` : ""}
<p>${esc(wake)}</p>
<p style="font-size:13px;color:#746c78">Order reference: ${esc(order.id)}</p>`,
    esc(sender()),
  );
  return { to: order.email ?? "", subject: names.length ? heading : `Your ${brand.name} order has shipped`, html, text };
}

export function signupConfirmEmail(to: string, topicName: string, confirmUrl: string, unsubscribeUrl: string): Mail {
  const text = [
    `Please confirm you'd like emails about ${topicName}.`,
    ``,
    `Confirm: ${confirmUrl}`,
    ``,
    `If you didn't ask for this, ignore this email and you won't hear from us.`,
    `Unsubscribe: ${unsubscribeUrl}`,
    ``,
    sender(),
  ].join("\n");
  const html = layout(
    "One more step",
    `<p>Please confirm you'd like emails from ${esc(brand.name)} about ${esc(topicName)}.</p>
<p><a href="${esc(confirmUrl)}" style="display:inline-block;background:#30263a;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Confirm my email</a></p>
<p style="font-size:13px;color:#746c78">If you didn't ask for this, ignore this email and you won't hear from us.</p>`,
    `${esc(sender())}<br><a href="${esc(unsubscribeUrl)}" style="color:#746c78">Unsubscribe</a>`,
  );
  return { to, subject: `Confirm your ${brand.name} launch emails`, html, text };
}
