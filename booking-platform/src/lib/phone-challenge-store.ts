export type PhoneChallenge = {
  identifier: string;
  codeHash: string;
  purpose: "signin" | "link";
  binding: string | null;
  expiresAt: Date;
};
export type PhoneChallengeAttempt = Omit<PhoneChallenge, "expiresAt">;
export type PhoneChallengeStore = {
  issue(challenge: PhoneChallenge): Promise<void>;
  consume(attempt: PhoneChallengeAttempt): Promise<boolean>;
  invalidate(identifier: string, codeHash: string): Promise<void>;
};

type Query = (sql: string, values: unknown[]) => Promise<{ rows: { valid?: boolean }[] }>;

/** A verified account can gain its first phone, never replace one in a race. */
export async function linkWhatsAppAccount(query: Query, userId: string, phone: string) {
  try {
    const result = await query(`UPDATE "user" SET "phoneNumber"=$2,"phoneNumberVerified"=true,"updatedAt"=now()
      WHERE id=$1 AND "phoneNumber" IS NULL AND "emailVerified"=true
      AND lower(email) NOT LIKE '%@phone.maxtravel.invalid' RETURNING true AS valid`, [userId, phone]);
    return result.rows[0]?.valid === true;
  } catch (error) {
    // A competing account may have claimed this number since the pre-check.
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return false;
    throw error;
  }
}

/** A single UPDATE locks and consumes the challenge; concurrent requests cannot
 * both succeed. Neither a phone number nor an OTP is stored in this table. */
export function postgresPhoneChallengeStore(query: Query): PhoneChallengeStore {
  return {
    async issue(value) {
      await query(`INSERT INTO auth_phone_challenges(identifier,code_hash,purpose,binding,expires_at)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(identifier) DO UPDATE SET
        code_hash=EXCLUDED.code_hash,purpose=EXCLUDED.purpose,binding=EXCLUDED.binding,
        expires_at=EXCLUDED.expires_at,attempts=0,consumed_at=NULL`,
      [value.identifier, value.codeHash, value.purpose, value.binding, value.expiresAt]);
    },
    async consume(value) {
      const result = await query(`UPDATE auth_phone_challenges SET attempts=attempts+1,
        consumed_at=CASE WHEN code_hash=$2 AND purpose=$3 AND binding IS NOT DISTINCT FROM $4 THEN now() ELSE consumed_at END
        WHERE identifier=$1 AND consumed_at IS NULL AND expires_at>now() AND attempts<5
        RETURNING code_hash=$2 AND purpose=$3 AND binding IS NOT DISTINCT FROM $4 AS valid`,
      [value.identifier, value.codeHash, value.purpose, value.binding]);
      return result.rows[0]?.valid === true;
    },
    async invalidate(identifier, codeHash) {
      await query("DELETE FROM auth_phone_challenges WHERE identifier=$1 AND code_hash=$2", [identifier, codeHash]);
    },
  };
}
