import assert from "node:assert/strict";
import test from "node:test";
import { consumeLabGoal, labRobotHref, storeLabGoal } from "../lib/careloop-lab-handoff";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test("Search hands the goal through browser storage without putting it in the robot URL", () => {
  const storage = memoryStorage();
  const privateGoal = "อยากฝึกเตรียมอุปกรณ์ก่อนทดลองส่วนตัว";

  assert.equal(storeLabGoal(storage, privateGoal), true);
  assert.equal(labRobotHref("robot 1"), "/robots/lab?robot=robot%201");
  assert.ok(!labRobotHref("robot 1").includes(privateGoal));
  assert.deepEqual(JSON.parse(storage.values.values().next().value!), { goalText: privateGoal });
});

test("the lab consumes the pending goal once and ignores malformed or oversized handoffs", () => {
  const storage = memoryStorage();

  assert.equal(consumeLabGoal(storage), null);
  storeLabGoal(storage, "  อยากวางแผนกิจกรรม  ");
  assert.equal(consumeLabGoal(storage), "อยากวางแผนกิจกรรม");
  assert.equal(consumeLabGoal(storage), null);
  storage.setItem("careloop-lab-goal-v1", JSON.stringify({ goalText: "x".repeat(501) }));
  assert.equal(consumeLabGoal(storage), null);
  assert.equal(storage.getItem("careloop-lab-goal-v1"), null);
});
