import "server-only";
import { boundedMail } from "./bounded-mail";
import { HttpError } from "./http";
export function mailReady() { return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM); }
export async function sendAccountMail(to: string, subject: string, url: string) {
  return sendMail(to,subject,`${subject}\n\n${url}\n\nIf you did not request this, you can ignore this email.\nMax Travel`);
}
export async function sendMail(to:string,subject:string,text:string){
  if (!mailReady()) throw new HttpError(503, "Email delivery is temporarily unavailable. Please try again later.");
  await boundedMail({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || "587"), secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined }, { from: process.env.MAIL_FROM, to, subject, text });
}
