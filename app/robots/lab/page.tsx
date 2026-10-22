import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import AdaptiveLab from "./AdaptiveLab";
import type { SearchRobot } from "@/lib/problem-search";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "CareLoop ทดลองปฏิสัมพันธ์",
  description: "ทดลองสถานการณ์ปฏิสัมพันธ์บนเว็บ พร้อมการยืนยัน หยุด และดูผลการทดลอง",
  alternates: { canonical: "/robots/lab" },
  robots: { index: false, follow: true }
};

export default async function InteractionLabPage({ searchParams }: {
  searchParams: Promise<{ robot?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedId = typeof params.robot === "string" ? params.robot.slice(0, 200) : "";
  let robots: SearchRobot[] = [];
  let databaseAvailable = true;
  try {
    const records = await prisma.robotModel.findMany({
      select: { id: true, canonicalName: true, description: true, robotType: true, primaryUseCase: true, officialUrl: true },
      orderBy: { canonicalName: "asc" }, take: 200
    });
    robots = records.map(robot => ({ ...robot, sourceMeta: null }));
  } catch (error) {
    console.error("Interaction lab registry unavailable:", error);
    databaseAvailable = false;
  }
  return <AdaptiveLab robots={robots} requestedId={requestedId} databaseAvailable={databaseAvailable} />;
}
