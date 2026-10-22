import type { Metadata } from "next";
import RequestExchange from "./RequestExchange";

export const metadata: Metadata = {
  title: "CareLoop ส่งคำขอ", robots: { index: false, follow: false },
  alternates: { canonical: "/robots/requests" }
};

export default function RequestSenderPage() {
  return <RequestExchange mode="sender" />;
}
