export type SearchRobot = {
  id: string;
  canonicalName: string;
  description: string | null;
  robotType: string;
  primaryUseCase: string | null;
  officialUrl: string | null;
  sourceMeta: unknown;
};

export type SearchSource = {
  title: string;
  url: string;
  excerpt: string;
  platform: string | null;
  rawMeta: unknown;
  publishedAt: Date | string | null;
};

export type Evidence = {
  title: string;
  url: string;
  excerpt: string;
  platform: string | null;
  publishedAt: Date | string | null;
};

export type SearchResult = {
  robot: SearchRobot;
  reasons: string[];
  evidence: Evidence[];
  matchedTerms: string[];
};

const intentGroups: Array<{ patterns: string[]; terms: string[]; label: string }> = [
  { patterns: ["เรียน", "การศึกษา", "สอน", "ห้องเรียน", "โค้ด", "เขียนโปรแกรม"], terms: ["education", "educational", "learning", "learn", "coding", "classroom", "school"], label: "การเรียน" },
  { patterns: ["วิดีโอคอล", "video call", "telepresence", "ทางไกล", "สื่อสาร", "คุยกับ", "ติดต่อ"], terms: ["telepresence", "video", "call", "communication", "remote", "presence"], label: "การสื่อสารทางไกล" },
  { patterns: ["ผู้สูงอายุ", "คนแก่", "สูงวัย", "ดูแลผู้สูง"], terms: ["eldercare", "elderly", "senior", "older", "aging", "ageing", "care"], label: "การดูแลผู้สูงอายุ" },
  { patterns: ["เพื่อน", "เหงา", "อยู่เป็นเพื่อน", "companionship"], terms: ["companion", "companionship", "social", "friend"], label: "การเป็นเพื่อน" },
  { patterns: ["เคลื่อนที่", "เดิน", "ช่วยเดิน", "การเคลื่อนไหว"], terms: ["mobility", "assistive", "assistance", "movement", "walking"], label: "การช่วยด้านการเคลื่อนไหว" },
  { patterns: ["โรงพยาบาล", "บริการ", "ฟื้นฟู", "rehabilitation", "ผู้ป่วย"], terms: ["hospital", "service", "rehabilitation", "patient", "healthcare"], label: "งานบริการหรือฟื้นฟู" }
];

const ignoredTerms = new Set(["a", "an", "and", "for", "from", "help", "i", "in", "is", "me", "my", "need", "of", "please", "robot", "the", "to", "want", "with", "อยาก", "ต้องการ", "ช่วย", "หา", "หุ่นยนต์", "ขอ"]);

function normalize(value: string) {
  return value.toLocaleLowerCase().normalize("NFKC");
}

function queryTerms(query: string) {
  const normalized = normalize(query);
  const terms = new Set<string>();
  const activatedIntents = new Set<string>();
  for (const intent of intentGroups) {
    if (intent.patterns.some((pattern) => normalized.includes(normalize(pattern)))) {
      activatedIntents.add(intent.label);
      for (const term of intent.terms) terms.add(term);
    }
  }
  for (const token of normalized.match(/[a-z0-9]+/g) ?? []) {
    if (!ignoredTerms.has(token) && token.length > 1) terms.add(token);
  }
  return { terms: [...terms], activatedIntents };
}

function containsWholeTerm(value: string, term: string) {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(normalize(value));
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function exactCanonicalName(value: unknown, expected: string, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => exactCanonicalName(entry, expected, seen));
  const record = value as Record<string, unknown>;
  if (typeof record.canonicalName === "string" && normalize(record.canonicalName).trim() === normalize(expected).trim()) return true;
  return Object.values(record).some((entry) => exactCanonicalName(entry, expected, seen));
}

function relatedEvidence(robot: SearchRobot, sources: SearchSource[]): Evidence[] {
  const robotUrl = safeHttpUrl(robot.officialUrl);
  return sources.flatMap((source) => {
    const sourceUrl = safeHttpUrl(source.url);
    if (!sourceUrl) return [];
    const sameUrl = robotUrl !== null && sourceUrl === robotUrl;
    if (!sameUrl && !exactCanonicalName(source.rawMeta, robot.canonicalName)) return [];
    return [{ title: source.title, url: sourceUrl, excerpt: source.excerpt, platform: source.platform, publishedAt: source.publishedAt }];
  });
}

export function searchRobots(robots: SearchRobot[], sources: SearchSource[], query: string): SearchResult[] {
  const { terms, activatedIntents } = queryTerms(query.trim());
  if (!terms.length) return [];

  return robots.flatMap((robot) => {
    const fields: Array<[string, string]> = [
      ["ชื่อรุ่น", robot.canonicalName],
      ["รายละเอียด", robot.description ?? ""],
      ["ประเภท", robot.robotType],
      ["กรณีใช้งานที่ระบุ", robot.primaryUseCase ?? ""]
    ];
    const matchedTerms = terms.filter((term) => fields.some(([, value]) => containsWholeTerm(value, term)));
    if (!matchedTerms.length) return [];
    const reasons = matchedTerms.map((term) => {
      const field = fields.find(([, value]) => containsWholeTerm(value, term))?.[0] ?? "ข้อมูล";
      return `พบคำว่า “${term}” ใน${field}`;
    });
    for (const intent of intentGroups) {
      const termsForIntent = intent.terms.filter((term) => matchedTerms.includes(term));
      if (activatedIntents.has(intent.label) && termsForIntent.length) reasons.push(`ตรงกับคำค้นด้าน${intent.label}จากข้อมูลที่ระบุ`);
    }
    return [{ robot, reasons, evidence: relatedEvidence(robot, sources), matchedTerms }];
  }).sort((a, b) => b.matchedTerms.length - a.matchedTerms.length || a.robot.canonicalName.localeCompare(b.robot.canonicalName));
}
