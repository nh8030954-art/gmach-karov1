// Temporary operator-directed pause; expiry is automatic and never persisted in D1.
export function deferNonessentialD1(env,now=Date.now()){
  const until=Date.parse(env?.D1_CONSERVE_UNTIL||'');
  return Number.isFinite(until)&&now<until;
}
