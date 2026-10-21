import Link from "next/link";
import { TravelHeader, TravelFooter, TravelIcon } from "./travel-shell";
import "@/app/account-experience.css";

export default function AccountExperienceShell({ children, active = "account" }: { children: React.ReactNode; active?: "account" | "travellers" }) {
  return <div className="account-experience"><TravelHeader active="account" /><main id="main-content" className="account-experience-main"><nav className="account-experience-nav" aria-label="Your travel workspace"><Link href="/account" aria-current={active === "account" ? "page" : undefined}><TravelIcon name="user" size={18} />Account & security</Link><Link href="/my-trips"><TravelIcon name="bag" size={18} />My trips</Link><Link href="/travellers" aria-current={active === "travellers" ? "page" : undefined}><TravelIcon name="receipt" size={18} />Saved travellers</Link></nav>{children}</main><TravelFooter /></div>;
}
