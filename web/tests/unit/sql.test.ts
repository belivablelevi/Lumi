import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// Runs the real migration in an in-process Postgres and exercises its functions.
const MIGRATION = readFileSync(new URL("../../supabase/migrations/0001_init.sql", import.meta.url), "utf8");
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

  it("frees reservations whose checkout window has passed", async () => {
    await db.exec("insert into capacity (sku, total) values ('LUMI-POCKET-01', 1)");
    await create(A);
    await db.query("update orders set reservation_expires_at = now() - interval '1 hour' where id = $1", [A]);
    expect(await create(B)).toBe("ok");
    expect(await status(A)).toBe("expired");
  });
});
