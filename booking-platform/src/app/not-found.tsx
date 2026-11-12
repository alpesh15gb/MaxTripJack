import Image from "next/image";
import Link from "next/link";
import { TravelHeader, TravelFooter } from "@/components/travel-shell";

export default function NotFound() {
  return <div className="travel-app">
    <TravelHeader />
    <main id="main-content" className="state-page state-page--discovery">
      <div>
        <span className="state-code" aria-hidden="true">404</span>
        <h1>We couldn’t find that page</h1>
        <p>The link may be out of date or mistyped. Start a new search or explore our holiday packages.</p>
        <div className="state-actions">
          <Link className="state-primary" href="/">Back to home</Link>
          <Link href="/packages">Browse packages</Link>
          <Link href="/customer-support">Contact support</Link>
        </div>
      </div>
      <div className="state-photo">
        <Image src="/travel/bali.jpg" alt="A temple reflected in a lake in Bali" fill sizes="(max-width: 700px) 100vw, 420px" />
      </div>
    </main>
    <TravelFooter />
  </div>;
}
