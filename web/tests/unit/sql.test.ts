import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// Runs the real migration in an in-process Postgres and exercises its functions.
const MIGRATION = readFileSync(new URL("../../supabase/migrations/0001_init.sql", import.meta.url), "utf8");
// pg_cron is a Supabase extension, so the schedule lines are left out here.
const CLEANUP = readFileSync(new URL("../../supabase/migrations/0002_cleanup.sql", import.meta.url), "utf8")
  .replace(/^create extension if not exists pg_cron;$/m, "")
  .replace(/^select cron\.schedule\(.*$/m, "");
const FULFILMENT = readFileSync(new URL("../../supabase/migrations/0003_fulfilment.sql", import.meta.url), "utf8");
const CHITCHATS = readFileSync(new URL("../../supabase/migrations/0004_chitchats.sql", import.meta.url), "utf8");
let db: PGlite;

const order = (id: string, qty = 1) => ({
  order: { id, fulfilment: "preorder", currency: "CAD", subtotal: 5900 * qty, createdAt: new Date().toISOString(), reservationExpiresAt: new Date(Date.now() + 31 * 60_000).toISOString() },
  items: [{ sku: "LUMI-POCKET-01", slug: "pocket-lumi", name: "Pocket Lumi", qty, unitAmount: 5900 }],
});
const create = async (id: string, qty = 1) => {
  const o = order(id, qty);
  return (await db.query<{ r: string }>("select create_order($1::jsonb, $2::jsonb) as r", [JSON.stringify(o.order), JSON.stringify(o.items)])).rows[0]!.r;
};
const cap = async () => (await db.query<{ total: number; reserved: number; sold: number }>("select total, reserved, sold from capacity where sku = 'LUMI-POCKET-01'")).rows[0]!;
const paid = async (id: string, mismatch = false) =>
  (await db.query<{ r: string }>("select mark_order_paid($1, $2, 'a@b.c', 'A', null, 6000, $3) as r", [id, `cs_${id}`, mismatch])).rows[0]!.r;
const status = async (id: string) => (await db.query<{ status: string }>("select status from orders where id = $1", [id])).rows[0]!.status;

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("database functions", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(MIGRATION.replace(/^revoke .*$/gm, "")); // roles don't exist in a bare Postgres
    await db.exec(CLEANUP.replace(/^revoke .*$/gm, ""));
    await db.exec(FULFILMENT.replace(/^revoke .*$/gm, ""));
    await db.exec(FULFILMENT.replace(/^revoke .*$/gm, "")); // safe to run twice
    await db.exec(CHITCHATS);
    await db.exec(CHITCHATS); // safe to run twice
  });
  beforeEach(async () => {
    await db.exec("truncate order_items, orders, capacity, stripe_events, launch_signups, signup_attempts cascade");
  });

  it("won't take orders for a SKU without capacity", async () => {
    expect(await create(A)).toBe("not_configured:LUMI-POCKET-01");
  });

  it("reserves, sells and releases capacity exactly", async () => {
    await db.exec("insert into capacity (sku, total) values ('LUMI-POCKET-01', 3)");
    expect(await create(A, 2)).toBe("ok");
    expect(await create(B, 2)).toBe("insufficient:LUMI-POCKET-01");
    expect(await cap()).toEqual({ total: 3, reserved: 2, sold: 0 });
    expect(await paid(A)).toBe("updated");
    expect(await paid(A)).toBe("already");
    expect(await cap()).toEqual({ total: 3, reserved: 0, sold: 2 });
    expect(await status(A)).toBe("paid");
    expect(await create(B, 1)).toBe("ok");
    await db.query("select release_order($1, 'expired')", [B]);
    await db.query("select release_order($1, 'expired')", [B]);
    expect(await cap()).toEqual({ total: 3, reserved: 0, sold: 2 });
    expect(await paid("33333333-3333-4333-8333-333333333333")).toBe("missing");
  });

  it("sends late or mismatched payments to review without breaking capacity", async () => {
    await db.exec("insert into capacity (sku, total) values ('LUMI-POCKET-01', 1)");
    await create(A);
    await db.query("select release_order($1, 'expired')", [A]);
    expect(await paid(A)).toBe("updated");
    expect(await status(A)).toBe("review");
    expect(await cap()).toEqual({ total: 1, reserved: 0, sold: 0 });
    await create(B);
    await paid(B, true);
    expect(await status(B)).toBe("review");
  });

  it("refunds return unshipped units exactly once", async () => {
    const refund = async (pi: string, amount: number, full: boolean) =>
      (await db.query<{ r: string }>("select mark_order_refunded($1, $2, $3) as r", [pi, amount, full])).rows[0]!.r;
    await db.exec("insert into capacity (sku, total) values ('LUMI-POCKET-01', 3)");
    await create(A);
    await create(B);
    await paid(A);
    await paid(B);
    await db.query("update orders set payment_intent = 'pi_' || substr(id::text, 1, 1) where id in ($1, $2)", [A, B]);
    expect(await cap()).toEqual({ total: 3, reserved: 0, sold: 2 });

    expect(await refund("pi_1", 1000, false)).toBe("partial");
    expect(await status(A)).toBe("paid");
    expect(await refund("pi_1", 6000, true)).toBe("updated");
    expect(await refund("pi_1", 6000, true)).toBe("already");
    expect(await status(A)).toBe("refunded");
    expect(await cap()).toEqual({ total: 3, reserved: 0, sold: 1 });

    // A shipped unit is gone: refunding it doesn't put it back on sale.
    await db.query("update orders set fulfilment_status = 'shipped' where id = $1", [B]);
    expect(await refund("pi_2", 6000, true)).toBe("updated");
    expect(await cap()).toEqual({ total: 3, reserved: 0, sold: 1 });
    expect(await refund("pi_9", 6000, true)).toBe("missing");
    // A refunded order isn't paid again by a late duplicate event.
    expect(await paid(A)).toBe("already");
  });

  it("stores the tip and shipping protection chosen at checkout", async () => {
    await db.exec("insert into capacity (sku, total) values ('LUMI-POCKET-01', 2)");
    const o = order(A);
    await db.query("select create_order($1::jsonb, $2::jsonb)", [JSON.stringify({ ...o.order, tipAmount: 500, protectionAmount: 398 }), JSON.stringify(o.items)]);
    await create(B);
    const rows = (await db.query<{ id: string; tip_amount: number; protection_amount: number }>("select id, tip_amount, protection_amount from orders order by id")).rows;
    expect(rows.map((r) => [r.tip_amount, r.protection_amount])).toEqual([[500, 398], [0, 0]]);
    await expect(db.query("update orders set tip_amount = -1 where id = $1", [A])).rejects.toThrow();
  });

  it("only allows known fulfilment states", async () => {
    await db.exec("insert into capacity (sku, total) values ('LUMI-POCKET-01', 1)");
    await create(A);
    await expect(db.query("update orders set fulfilment_status = 'lost' where id = $1", [A])).rejects.toThrow();
  });

  it("frees reservations whose checkout window has passed", async () => {
    await db.exec("insert into capacity (sku, total) values ('LUMI-POCKET-01', 1)");
    await create(A);
    await db.query("update orders set reservation_expires_at = now() - interval '1 hour' where id = $1", [A]);
    expect(await create(B)).toBe("ok");
    expect(await status(A)).toBe("expired");
  });

  it("deletes only the personal data the privacy policy says it stops keeping", async () => {
    const signup = (email: string, consented: string, confirmed: string | null, unsubscribed: string | null) =>
      db.query(
        `insert into launch_signups (email, topic, consent_text, consent_version, consented_at, confirm_token_hash, unsubscribe_token_hash, confirmed_at, unsubscribed_at)
         values ($1, 't', 'c', 'v', now() - $2::interval, $1 || 'c', $1 || 'u', now() - $3::interval, now() - $4::interval)`,
        [email, consented, confirmed, unsubscribed],
      );
    await signup("old-unconfirmed@x.ca", "91 days", null, null); // deleted
    await signup("new-unconfirmed@x.ca", "89 days", null, null);
    await signup("old-confirmed@x.ca", "5 years", "5 years", null); // still subscribed: kept
    await signup("unsub-old@x.ca", "5 years", "5 years", "1096 days"); // deleted
    await signup("unsub-recent@x.ca", "2 years", "2 years", "1 year");
    await db.exec(
      "insert into signup_attempts (key_hash, at) values ('old', now() - interval '31 days'), ('new', now() - interval '29 days')",
    );
    await db.exec("insert into capacity (sku, total) values ('LUMI-POCKET-01', 1)");
    await create(A);
    await db.query("update orders set created_at = now() - interval '10 years' where id = $1", [A]);

    const r = (await db.query<{ r: Record<string, number> }>("select cleanup_personal_data() as r")).rows[0]!.r;
    expect(r).toEqual({ unconfirmed_signups: 1, signup_attempts: 1, unsubscribed_signups: 1 });
    const left = (await db.query<{ email: string }>("select email from launch_signups order by email")).rows.map((x) => x.email);
    expect(left).toEqual(["new-unconfirmed@x.ca", "old-confirmed@x.ca", "unsub-recent@x.ca"]);
    expect((await db.query("select key_hash from signup_attempts")).rows).toEqual([{ key_hash: "new" }]);
    expect(await status(A)).toBe("pending"); // orders are never touched
  });
});
