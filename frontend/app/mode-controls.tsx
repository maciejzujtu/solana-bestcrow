'use client';

import { savePaymentMode, usePaymentMode, type PaymentMode } from './lib/payment-mode';

export default function ModeControls() {
  const mode = usePaymentMode();
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
      <span>Payment mode</span>
      <select
        aria-label="Payment mode"
        className="rounded-lg border border-slate-300 bg-white px-2 py-1"
        value={mode}
        onChange={(event) => {
          savePaymentMode(event.target.value as PaymentMode);
          window.location.assign('/');
        }}
      >
        <option value="mock">Mock · no SOL moves</option>
        <option value="devnet">Devnet · test SOL</option>
      </select>
    </label>
  );
}
