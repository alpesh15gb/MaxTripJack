import Link from "next/link";
import { TravelHeader, TravelFooter, TravelIcon } from "./travel-shell";
import "@/app/account-experience.css";

type WorkspacePage = "account" | "travellers" | "trips";

export function WorkspaceNavigation({ active }: { active: WorkspacePage }) {
  return <aside className="account-workspace-sidebar">
    <p className="account-workspace-label">Your travel space</p>
    <nav className="account-experience-nav" aria-label="Your travel workspace">
      <Link href="/account" aria-current={active === "account" ? "page" : undefined}><TravelIcon name="user" size={18} />Account & security</Link>
      <Link href="/my-trips" aria-current={active === "trips" ? "page" : undefined}><TravelIcon name="bag" size={18} />My trips</Link>
      <Link href="/travellers" aria-current={active === "travellers" ? "page" : undefined}><TravelIcon name="receipt" size={18} />Saved travellers</Link>
    </nav>
    <Link className="account-workspace-help" href="/customer-support"><TravelIcon name="shield" size={18} />Help with your journey<TravelIcon name="arrow" size={16} /></Link>
  </aside>;
}

export default function AccountExperienceShell({ children, active = "account" }: { children: React.ReactNode; active?: WorkspacePage }) {
  return <div className="account-experience">
    <TravelHeader active="account" />
    <main id="main-content" className="account-experience-main account-workspace-layout">
      <WorkspaceNavigation active={active} />
      <div className="account-workspace-content">{children}</div>
    </main>
    <TravelFooter compact />
  </div>;
}
