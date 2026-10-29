"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import type { Product } from "@/content/products";
import { CartProvider, type Services } from "./cart/CartProvider";

export function Providers(props: { catalogue: Product[]; services: Services; allowMixed: boolean; children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <CartProvider catalogue={props.catalogue} services={props.services} allowMixed={props.allowMixed}>
        {props.children}
      </CartProvider>
    </MotionConfig>
  );
}
