import assert from "node:assert/strict";

const base = process.env.QA_URL;
if (!base || !/gmach-karov1-qa/.test(base)) throw new Error("QA_URL must point to the isolated QA Worker");

const pad = (n, width = 3) => String(n).padStart(width, "0");
const token = n => `qa-demo-session-${pad(n)}-activity-v1`;
const cookie = n => `gmach_session=${token(n)}`;
const latencies = [];
const failures = [];

async function api(path, { user, method = "GET", body } = {}) {
  const started = performance.now();
  try {
    const headers = { "User-Agent": "gmach-qa-activity/1.0", "Origin": base, "Sec-Fetch-Site": "same-origin" };
    if (user) {
      headers.Cookie = cookie(user);
      headers["Accept-Language"] = user % 2 === 0 ? "en" : "he";
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
    latencies.push(Math.round(performance.now() - started));
    return { status: response.status, data };
  } catch (error) {
    latencies.push(Math.round(performance.now() - started));
    return { status: 0, data: { error: String(error?.message || error) } };
  }
}

async function pool(entries, concurrency, handler) {
  let index = 0;
  const results = new Array(entries.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (index < entries.length) {
      const current = index++;
      try { results[current] = await handler(entries[current], current); }
      catch (error) { results[current] = { ok: false, error: String(error?.message || error) }; }
    }
  }));
  return results;
}

function record(stage, result, expected) {
  const ok = expected.includes(result.status);
  if (!ok && failures.length < 40) failures.push({ stage, status: result.status, error: result.data?.error || result.data?.message || null });
  return ok;
}

const sampledActors = Array.from({ length: 24 }, (_, i) => 37 + i);
const profileChecks = await pool(sampledActors, 8, async user => {
  const result = await api("/api/me/profile", { user });
  const expectedLanguage = user % 2 === 0 ? "en" : "he";
  const actualLanguage = result.data?.profile?.preferredLanguage;
  return { ok: result.status === 200 && actualLanguage === expectedLanguage, status: result.status, expectedLanguage, actualLanguage };
});
assert.equal(profileChecks.filter(x => x.ok).length, profileChecks.length, "QA actors must authenticate and preserve Hebrew/English preference");

const actors = Array.from({ length: 120 }, (_, i) => {
  const borrower = 37 + i;
  const org = (i % 36) + 1;
  const itemIndex = Math.floor(i / 36) + 1;
  return {
    i,
    borrower,
    owner: org,
    org,
    itemId: `qa-demo-item-${pad(org, 2)}-${itemIndex}`,
    requestedFrom: "2026-10-15T10:00",
    requestedUntil: "2026-10-16T12:00"
  };
});

const created = await pool(actors, 10, async actor => {
  const favorite = await api(`/api/favorites/${actor.itemId}`, { user: actor.borrower, method: "POST" });
  const favoriteOk = record("favorite", favorite, [200, 201]);
  const loan = await api("/api/loan-requests", {
    user: actor.borrower,
    method: "POST",
    body: {
      itemId: actor.itemId,
      requestedFrom: actor.requestedFrom,
      requestedUntil: actor.requestedUntil,
      quantity: 1,
      depositAccepted: true,
      phone: `050-7${pad(actor.borrower, 6)}`,
      note: actor.borrower % 2 === 0 ? "QA activity request" : "בקשת QA לבדיקת פעילות"
    }
  });
  const loanOk = record("loan-create", loan, [201]);
  const requestId = loan.data?.request?.id;
  let messageOk = false;
  if (requestId) {
    const message = await api(`/api/loan-requests/${requestId}/messages`, {
      user: actor.borrower,
      method: "POST",
      body: { message: actor.borrower % 2 === 0 ? "Can pickup be coordinated here?" : "אפשר לתאם כאן את האיסוף?" }
    });
    messageOk = record("borrower-message", message, [201]);
  }
  return { ...actor, requestId, favoriteOk, loanOk, messageOk };
});

const createdLoans = created.filter(x => x?.requestId);
console.log(JSON.stringify({
  stage:"loan-create-diagnostic",
  created:createdLoans.length,
  total:created.length,
  failures:failures.slice(0,25),
  samples:created.slice(0,8).map(x=>({borrower:x.borrower,itemId:x.itemId,loanOk:x.loanOk,requestId:x.requestId||null}))
}));
assert.ok(createdLoans.length >= 114, `Expected at least 95% loan creation success, got ${createdLoans.length}/120`);

const managed = await pool(createdLoans, 10, async entry => {
  const managerMessage = await api(`/api/loan-requests/${entry.requestId}/messages`, {
    user: entry.owner,
    method: "POST",
    body: { message: entry.owner % 2 === 0 ? "Manager reviewed this QA request." : "הבקשה נבדקה על ידי מנהל הגמ״ח." }
  });
  const managerMessageOk = record("manager-message", managerMessage, [201]);
  const decision = entry.i % 4 === 0 ? "declined" : "approved";
  const status = await api(`/api/loan-requests/${entry.requestId}/status`, {
    user: entry.owner,
    method: "PATCH",
    body: { status: decision, managerNote: "QA launch simulation" }
  });
  const decisionOk = record("manager-decision", status, [200]);
  let lifecycleOk = true;
  if (decision === "approved" && entry.i % 3 === 0 && decisionOk) {
    const collected = await api(`/api/loan-requests/${entry.requestId}/status`, {
      user: entry.owner,
      method: "PATCH",
      body: { status: "collected", managerNote: "QA simulated pickup" }
    });
    const returned = collected.status === 200 ? await api(`/api/loan-requests/${entry.requestId}/status`, {
      user: entry.owner,
      method: "PATCH",
      body: { status: "returned", managerNote: "QA simulated return" }
    }) : { status: 0, data: {} };
    lifecycleOk = record("collect", collected, [200]) && record("return", returned, [200]);
  }
  return { decision, managerMessageOk, decisionOk, lifecycleOk };
});

const decisionSuccess = managed.filter(x => x?.decisionOk).length;
assert.ok(decisionSuccess >= Math.floor(createdLoans.length * 0.95), `Manager decisions below 95%: ${decisionSuccess}/${createdLoans.length}`);

const dashboards = await pool(sampledActors, 8, async user => {
  const result = await api("/api/me/dashboard", { user });
  return { ok: result.status === 200 };
});
assert.ok(dashboards.filter(x => x.ok).length >= 23, "Dashboard reads must remain healthy after concurrent writes");

const collisionBorrowers = Array.from({ length: 12 }, (_, i) => 180 + i);
const collisionCreates = await pool(collisionBorrowers, 12, async borrower => {
  const result = await api("/api/loan-requests", {
    user: borrower,
    method: "POST",
    body: {
      itemId: "qa-demo-item-01-1",
      requestedFrom: "2027-03-01T10:00",
      requestedUntil: "2027-03-02T10:00",
      quantity: 1,
      depositAccepted: true,
      phone: `052-8${pad(borrower, 6)}`,
      note: "QA collision test"
    }
  });
  return { borrower, status: result.status, requestId: result.data?.request?.id };
});
const collisionRequests = collisionCreates.filter(x => x.requestId);
assert.ok(collisionRequests.length >= 1, "Collision test must create at least one request");

const collisionApprovals = await pool(collisionRequests, 12, async entry => {
  const result = await api(`/api/loan-requests/${entry.requestId}/status`, {
    user: 1,
    method: "PATCH",
    body: { status: "approved", managerNote: "QA collision approval race" }
  });
  return result.status;
});
const approvedCollisions = collisionApprovals.filter(status => status === 200).length;
assert.ok(approvedCollisions <= 1, `Oversubscription detected: ${approvedCollisions} overlapping approvals succeeded for quantity 1`);
assert.ok(approvedCollisions >= 1, "At least one collision request should be approvable");

const sorted = latencies.slice().sort((a, b) => a - b);
const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0;
const summary = {
  actors: 250,
  organizations: 36,
  catalogItems: 216,
  bilingualProfilesChecked: profileChecks.length,
  borrowerScenariosAttempted: actors.length,
  loansCreated: createdLoans.length,
  favoritesSucceeded: created.filter(x => x?.favoriteOk).length,
  borrowerMessagesSucceeded: created.filter(x => x?.messageOk).length,
  managerDecisionsSucceeded: decisionSuccess,
  approved: managed.filter(x => x?.decision === "approved" && x?.decisionOk).length,
  declined: managed.filter(x => x?.decision === "declined" && x?.decisionOk).length,
  completedLifecycles: managed.filter(x => x?.lifecycleOk && x?.decision === "approved").length,
  collisionRequestsCreated: collisionRequests.length,
  collisionApprovalsSucceeded: approvedCollisions,
  requestsMeasured: latencies.length,
  p95Ms: p95,
  failures
};
console.log(JSON.stringify(summary));
if (failures.length > Math.max(8, Math.floor(latencies.length * 0.03))) {
  throw new Error(`Too many QA activity failures: ${failures.length}/${latencies.length}`);
}
