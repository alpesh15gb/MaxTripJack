/** Atomic transfer of anonymous search ownership only. No quote/order mutation. */
export const CLAIM_GUEST_SEARCH_SQL = "UPDATE supplier_searches SET user_id=$1,company_id=$2 WHERE id=$3 AND user_id=$4 AND company_id IS NULL AND expires_at>now() AND service_kind IS NULL";
export async function claimShoppingSearch(db: { query(sql: string, values: unknown[]): Promise<{ rowCount: number | null }> }, searchId: string, guestId: string, actor: { userId: string; companyId: string | null }) {
  if (!/^guest:[a-f0-9]{64}$/.test(guestId) || !actor.userId || actor.userId.startsWith("guest:")) throw new Error("Invalid shopping ownership transfer.");
  const result = await db.query(CLAIM_GUEST_SEARCH_SQL, [actor.userId, actor.companyId, searchId, guestId]);
  return result.rowCount === 1;
}
