import type { Metadata } from "next";
import RequestExchange from "../RequestExchange";

export const metadata: Metadata = {
  title: "CareLoop รับคำขอ", robots: { index: false, follow: false },
  referrer: "no-referrer", alternates: { canonical: "/robots/requests/receive" }
};

export default function RequestReceiverPage() {
  return <RequestExchange mode="receiver" />;
}
