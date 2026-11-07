export type Attempt = {
  seen: number;
  correct: number;
  last: boolean;
};

export type AnswerBook = {
  results: Record<string, Attempt>;
  owner: string | null;
  synced: Record<string, Attempt> | null;
};

export function sameAttempt(a: Attempt, b: Attempt): boolean {
  return a.seen === b.seen && a.correct === b.correct && a.last === b.last;
}

export function clampAttempt(seen: number, correct: number, last: boolean): Attempt {
  const safeSeen = Math.max(1, Math.trunc(seen));
  let safeCorrect = Math.min(safeSeen, Math.max(0, Math.trunc(correct)));
  if (last && safeCorrect < 1) safeCorrect = Math.min(safeSeen, 1);
  if (!last && safeCorrect >= safeSeen) safeCorrect = Math.max(0, safeSeen - 1);
  return { seen: safeSeen, correct: safeCorrect, last };
}

function mergeAttempt(
  local: Attempt | undefined,
  remote: Attempt | undefined,
  baseline: Attempt | undefined,
  mode: "max" | "delta",
): Attempt | undefined {
  if (!local) return remote;
  if (!remote) return local;
  if (sameAttempt(local, remote)) return remote;
  if (mode === "max") {
    if (local.seen !== remote.seen) return local.seen > remote.seen ? local : remote;
    return remote;
  }
  const baseSeen = baseline?.seen ?? 0;
  const deltaSeen = local.seen - baseSeen;
  const deltaCorrect = local.correct - (baseline?.correct ?? 0);
  if (deltaSeen <= 0) return remote;
  if (remote.seen === baseSeen) return local;
  return clampAttempt(remote.seen + deltaSeen, remote.correct + deltaCorrect, local.last);
}

export function buildAnswerSync(input: {
  userId: string;
  started: AnswerBook;
  remote: Record<string, Attempt>;
  countsOnServer: boolean;
  latest: AnswerBook;
}): { results: Record<string, Attempt>; synced: Record<string, Attempt> | null; upload: Record<string, Attempt> } {
  const claim = input.started.owner === null || input.started.owner === input.userId;
  const local = claim ? input.started.results : {};
  const mode = claim && input.started.owner === input.userId && input.started.synced ? "delta" : "max";
  const baseline = mode === "delta" ? input.started.synced : null;
  const results: Record<string, Attempt> = {};
  const upload: Record<string, Attempt> = {};

  for (const id of new Set([...Object.keys(local), ...Object.keys(input.remote)])) {
    const localAttempt = local[id];
    const remoteAttempt = input.remote[id];
    let next: Attempt | undefined;
    if (!input.countsOnServer) {
      next = localAttempt ?? remoteAttempt;
      if (localAttempt && (!remoteAttempt || remoteAttempt.last !== localAttempt.last)) upload[id] = localAttempt;
    } else {
      next = mergeAttempt(localAttempt, remoteAttempt, baseline?.[id], mode);
      if (next && (!remoteAttempt || !sameAttempt(next, remoteAttempt))) upload[id] = next;
    }
    if (next) results[id] = next;
  }

  const fold = input.latest.owner === input.userId || (claim && input.latest.owner === null);
  if (fold) {
    for (const [id, attempt] of Object.entries(input.latest.results)) {
      const before = input.started.results[id];
      if (before && attempt.seen <= before.seen) continue;
      const extraSeen = attempt.seen - (before?.seen ?? 0);
      const extraCorrect = attempt.correct - (before?.correct ?? 0);
      const base = results[id];
      const combined = base
        ? clampAttempt(base.seen + extraSeen, base.correct + extraCorrect, attempt.last)
        : attempt;
      results[id] = combined;
      upload[id] = combined;
    }
  }

  const synced = input.countsOnServer ? { ...results } : null;
  return { results, synced, upload };
}
