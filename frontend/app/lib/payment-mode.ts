'use client';

import { useEffect, useState } from 'react';

export type PaymentMode = 'mock' | 'devnet';

const STORAGE_KEY = 'bestcrow:payment-mode';
export const DEFAULT_PAYMENT_MODE: PaymentMode =
  process.env.NEXT_PUBLIC_PAYMENT_MODE === 'devnet' ? 'devnet' : 'mock';

export function readPaymentMode(): PaymentMode {
  if (typeof window === 'undefined') return DEFAULT_PAYMENT_MODE;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'devnet' ? 'devnet' :
      window.localStorage.getItem(STORAGE_KEY) === 'mock' ? 'mock' : DEFAULT_PAYMENT_MODE;
  } catch {
    return DEFAULT_PAYMENT_MODE;
  }
}

export function savePaymentMode(mode: PaymentMode): void {
  window.localStorage.setItem(STORAGE_KEY, mode);
}

export function usePaymentMode(): PaymentMode {
  const [mode, setMode] = useState<PaymentMode>(DEFAULT_PAYMENT_MODE);
  useEffect(() => setMode(readPaymentMode()), []);
  return mode;
}
