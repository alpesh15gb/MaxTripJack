import {getCompanyProfile} from "./company-settings";
import "server-only";
import { boundedMail } from "./bounded-mail";
import { HttpError } from "./http";
export function mailReady() { return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM); }
export async function sendAccountMail(to: string, subject: string, url: string) {
  return sendMail(to,subject,`${subject}\n\n${url}\n\nIf you did not request this, you can ignore this email.`);
}
export async function sendMail(to:string,subject:string,text:string){
  if (!mailReady()) throw new HttpError(503, "Email delivery is temporarily unavailable. Please try again later.");
  const company=await getCompanyProfile();
  const signature=`\n\n${company.legalName||company.name}\n${company.address.display}\n${company.phone} | ${company.email}\n${company.hours.display}${company.gstNumber?`\nGSTIN: ${company.gstNumber}`:""}`;
  await boundedMail({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || "587"), secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined }, { from: process.env.MAIL_FROM, to, subject, replyTo:company.email, text:text+signature });
}
