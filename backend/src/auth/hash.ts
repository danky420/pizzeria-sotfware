import argon2 from "argon2";

// OWASP Password Storage Cheat Sheet (argon2id, 19 MiB, t=2, p=1).
const OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Burned on a login attempt for an unknown or inactive email so the response time
// does not reveal whether the account exists.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Q1CvBmRIvjs4gXDQKSJTCqAXX2JYrAYCa3GRJkTn3fw";

export async function burnTiming(password: string): Promise<void> {
  await verifyPassword(DUMMY_HASH, password);
}
