export function acquireClaim(nodeId: string, owner: string, ttl: number) {
  return { nodeId, owner, claimedAt: new Date().toISOString(), claimExpiry: new Date(Date.now() + ttl * 1000).toISOString() };
}
export function releaseClaim(nodeId: string) {
  return { released: true, nodeId };
}
