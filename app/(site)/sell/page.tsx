import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { DeckImport } from "./DeckImport";
import { SellFlow } from "./SellFlow";

/* PRD #1: list items. Signed-in + onboarded only. */
export default function SellPage() {
  return (
    <div className="wf">
      <Suspense fallback={<div className="wrap"><p className="sub">loading…</p></div>}>
        <Gate />
      </Suspense>
    </div>
  );
}

async function Gate() {
  const user = await requireUser("/sell");
  return (
    <>
      <div className="wrap" style={{ paddingTop: 24 }}>
        <DeckImport />
      </div>
      <SellFlow defaults={{ email: user.email, phone: user.phone, payments: user.payments, building: user.building }} />
    </>
  );
}
