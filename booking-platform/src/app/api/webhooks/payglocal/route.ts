import { failure } from "@/lib/http";
import { assertPayGlocalTransportReady } from "@/lib/providers/payglocal";

// Fail closed: no guessed signature header, no unsigned payment mutations.
export async function POST() {
  try { assertPayGlocalTransportReady(); } catch (error) { return failure(error); }
}
