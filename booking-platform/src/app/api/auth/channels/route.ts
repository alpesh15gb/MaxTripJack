import { json } from "@/lib/http";
import { mailReady } from "@/lib/mail";
import { whatsappReady } from "@/lib/whatsapp";

/** Only public availability flags: credentials and provider addresses stay server-side. */
export function GET() {
  return json({ email: mailReady(), whatsapp: whatsappReady() });
}
