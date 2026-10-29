import { env } from "../env";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

let store: Store | null | undefined;

/** The configured Store, or null when Supabase isn't set up. Server only. */
export function getStore(): Store | null {
  if (store === undefined) {
    store = env.supabaseUrl && env.supabaseServiceKey ? new SupabaseStore(env.supabaseUrl, env.supabaseServiceKey) : null;
  }
  return store;
}

export type { Store } from "./types";
