"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CampaignLookup() {
  const router = useRouter();
  const [address, setAddress] = useState("");

  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = address.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return;
    router.push("/campaign/" + value);
  }

  return (
    <form onSubmit={open} className="lookup">
      <label htmlFor="campaign-address">Campaign address</label>
      <div className="lookup-row">
        <input id="campaign-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Solana campaign address" required />
        <button type="submit">Open campaign</button>
      </div>
    </form>
  );
}
