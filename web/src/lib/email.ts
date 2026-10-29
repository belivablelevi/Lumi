import { Resend } from "resend";
import { brand } from "@/config/brand";
import { env } from "./env";
import { formatMoney } from "./money";
import { confirmed } from "./placeholder";
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
  return {
    async send(m) {
      const { error } = await resend.emails.send({ from, to: m.to, subject: m.subject, html: m.html, text: m.text });
      if (error) throw new Error(`email failed: ${error.message}`);
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, body: string, footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#f9f7f3;font-family:Manrope,Helvetica,Arial,sans-serif;color:#30263a">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-size:22px;font-weight:800;margin:0 0 24px">${esc(brand.name)}</p>
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
  const lines = order.items.map((i) => `${i.qty} × ${i.name} — ${formatMoney({ amount: i.unitAmount * i.qty, currency: order.currency })}`);
  const total = formatMoney({ amount: order.amountTotal ?? order.subtotal, currency: order.currency });
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
