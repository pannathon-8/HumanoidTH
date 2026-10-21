import assert from "node:assert/strict";
import test from "node:test";
import { searchRobots, type SearchRobot, type SearchSource } from "../lib/problem-search";

const educationRobot: SearchRobot = {
  id: "edu-1",
  canonicalName: "Robo-Buddy",
  description: "Educational robot for learning and coding activities.",
  robotType: "education_robot",
  primaryUseCase: "classroom education",
  officialUrl: "https://example.org/robo-buddy",
  sourceMeta: null
};
const sources: SearchSource[] = [{
  title: "A misleading title mentioning Robo-Buddy",
  url: "https://source.example/article",
  excerpt: "This article is about a different product.",
  platform: "news",
  rawMeta: { category: "source_record", canonicalName: "Other Robot" },
  publishedAt: null
}];

test("Thai education intent matches English model details and names its recorded reason", () => {
  const [result] = searchRobots([educationRobot], [], "อยากได้หุ่นยนต์ช่วยเรียน");
  assert.equal(result.robot.id, "edu-1");
  assert.ok(result.reasons.some((reason) => reason.includes("การเรียน")));
  assert.deepEqual(result.evidence, []);
});

test("English matching ignores case and punctuation", () => {
  const results = searchRobots([educationRobot], [], "CODING!");
  assert.deepEqual(results.map(({ robot }) => robot.canonicalName), ["Robo-Buddy"]);
});

test("Latin query terms match whole words and treat robot type separators as boundaries", () => {
  const thaiRobot = { ...educationRobot, description: "Thai robot platform." };
  const localRobot = { ...educationRobot, description: "This platform operates locally." };
  assert.deepEqual(searchRobots([thaiRobot], [], "AI"), []);
  assert.deepEqual(searchRobots([localRobot], [], "call"), []);
  const robot = { ...educationRobot, robotType: "telepresence_robot" };
  assert.equal(searchRobots([robot], [], "telepresence").length, 1);
});

test("unrelated and unknown requests do not turn into broad matches", () => {
  assert.deepEqual(searchRobots([educationRobot], [], "need a submarine"), []);
  assert.deepEqual(searchRobots([educationRobot], [], "อยากให้ช่วย"), []);
  assert.deepEqual(searchRobots([educationRobot], [], "ช่วยเหลือ"), []);
  assert.deepEqual(searchRobots([educationRobot], [], "การช่วยเหลือ"), []);
  const generalHelpRobot = { ...educationRobot, description: "A general assistance platform." };
  assert.deepEqual(searchRobots([generalHelpRobot], [], "ช่วยเหลือ"), []);
  assert.deepEqual(searchRobots([educationRobot], [], "   "), []);
});

test("a general care request does not gain an elderly-care reason", () => {
  const robot = { ...educationRobot, description: "Hospital care robot." };
  const [result] = searchRobots([robot], [], "hospital care");
  assert.ok(result);
  assert.ok(!result.reasons.some((reason) => reason.includes("ผู้สูงอายุ")));
});

test("results are deterministic and tie-break by canonical name", () => {
  const a = { ...educationRobot, id: "z", canonicalName: "Zeta", description: "education" };
  const b = { ...educationRobot, id: "a", canonicalName: "Alpha", description: "education" };
  assert.deepEqual(searchRobots([a, b], [], "education").map((r) => r.robot.id), ["a", "z"]);
});

test("a title coincidence is not treated as evidence for a robot", () => {
  const [result] = searchRobots([educationRobot], sources, "coding");
  assert.deepEqual(result.evidence, []);
});

test("explicit canonical metadata associates a safe source without asserting suitability", () => {
  const source: SearchSource = {
    title: "Learning robot",
    url: "https://source.example/robot",
    excerpt: "The robot was used in a school demonstration.",
    platform: "news",
    rawMeta: { nested: { canonicalName: "Robo-Buddy" } },
    publishedAt: null
  };
  const [result] = searchRobots([educationRobot], [source], "learning");
  assert.equal(result.evidence[0]?.excerpt, source.excerpt);
  assert.equal(result.evidence[0]?.url, source.url);
  assert.equal(result.evidence.length, 1);
});

test("an exact safe official URL associates its source even without robot metadata", () => {
  const source: SearchSource = {
    title: "Official model page",
    url: "https://example.org/robo-buddy",
    excerpt: "",
    platform: "official_company_website",
    rawMeta: { canonicalName: "A different model" },
    publishedAt: null
  };
  const [result] = searchRobots([educationRobot], [source], "coding");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.excerpt, "");
});

test("unsafe source URLs are never returned as evidence", () => {
  const source: SearchSource = {
    title: "Learning robot",
    url: "javascript:alert(1)",
    excerpt: "learning",
    platform: null,
    rawMeta: { canonicalName: "Robo-Buddy" },
    publishedAt: null
  };
  const [result] = searchRobots([educationRobot], [source], "learning");
  assert.deepEqual(result.evidence, []);
});
