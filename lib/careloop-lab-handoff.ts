export const LAB_GOAL_HANDOFF_KEY = "careloop-lab-goal-v1";

type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function storeLabGoal(storage: Pick<HandoffStorage, "setItem">, goalText: string): boolean {
  const goal = goalText.trim();
  if (!goal || goal.length > 500) return false;
  try {
    storage.setItem(LAB_GOAL_HANDOFF_KEY, JSON.stringify({ goalText: goal }));
    return true;
  } catch {
    return false;
  }
}

export function consumeLabGoal(storage: Pick<HandoffStorage, "getItem" | "removeItem">): string | null {
  try {
    const pending = storage.getItem(LAB_GOAL_HANDOFF_KEY);
    storage.removeItem(LAB_GOAL_HANDOFF_KEY);
    if (!pending) return null;
    const parsed: unknown = JSON.parse(pending);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const goal = (parsed as { goalText?: unknown }).goalText;
    return typeof goal === "string" && goal.trim().length > 0 && goal.trim().length <= 500 ? goal.trim() : null;
  } catch {
    return null;
  }
}

export function labRobotHref(robotId: string): string {
  return `/robots/lab?robot=${encodeURIComponent(robotId)}`;
}
