import Link from "next/link";
import {database} from "@/lib/db";
import {displayMoney} from "@/lib/display-money";
import {StitchSymbol} from "./stitch-symbol";

type Offer = {
  product:"FLIGHT"|"HOTEL"|"ALL";
  discount_minor:string;
  discount_basis_points:number;
  minimum_minor:string;
  maximum_discount_minor:string | null;
  expires_at:Date;
};
const planningCards = [
  {tag:"Flight deals",title:"Compare dates for your next flight",detail:"Explore nearby departure dates and compare available fares before choosing your flight.",action:"Find flights",href:"/book?product=FLIGHT"},
  {tag:"Hotel escapes",title:"Discover a stay that fits your trip",detail:"Compare room plans, inclusions and the full stay price for your dates.",action:"Browse hotels",href:"/hotels"},
  {tag:"Holiday packages",title:"Explore handpicked holiday plans",detail:"Browse published itineraries and ask our team for a quote tailored to your group.",action:"See packages",href:"/packages"},
];

async function publishedOffers(): Promise<Offer[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    // The checkout still controls code discovery and calculates the final eligible discount.
    return (await database().query<Offer>(`
      SELECT DISTINCT product, discount_minor, discount_basis_points, minimum_minor, maximum_discount_minor, expires_at
      FROM promo_codes WHERE active AND discoverable AND expires_at > now()
      ORDER BY expires_at LIMIT 3
    `)).rows;
  } catch {
    return [];
  }
}

export default async function HomeOffers() {
  const offers = await publishedOffers();
  const cards = offers.length ? offers.map(offer => {
    const product = offer.product === "FLIGHT" ? "flights" : offer.product === "HOTEL" ? "hotels" : "flights and hotels";
    const discount = offer.discount_basis_points ? `${offer.discount_basis_points / 100}%` : displayMoney(Number(offer.discount_minor));
    const minimum = Number(offer.minimum_minor);
    const cap = Number(offer.maximum_discount_minor);
    return {tag:product, title:`Up to ${discount} off eligible ${product}`,
      detail:[minimum > 0 ? `Minimum booking ${displayMoney(minimum)}.` : "",cap ? `Maximum saving ${displayMoney(cap)}.` : "",
        `Valid until ${new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Kolkata"}).format(offer.expires_at)}. See eligible offers at checkout.`].filter(Boolean).join(" "),
      action:offer.product === "HOTEL" ? "Find stays" : "Find flights",href:offer.product === "HOTEL" ? "/book?product=HOTEL" : "/book?product=FLIGHT"};
  }) : planningCards;
  return <section className="stitch-ideas stitch-home-wrap" aria-labelledby="stitch-ideas-title">
    <div className="stitch-section-title"><div className="stitch-offer-heading"><span className="stitch-wide-only">{offers.length ? "Super offers" : "Travel ideas"}</span><h2 id="stitch-ideas-title"><span className="stitch-wide-only">{offers.length ? "Deals for your next journey" : "Plan your next journey"}</span><span className="stitch-phone-only">{offers.length ? "Super offers" : "Travel ideas"}</span></h2></div><Link href="/pricing-transparency">Pricing guide <StitchSymbol name="arrow_forward" size={16}/></Link></div>
    <div className="stitch-ideas-grid">{cards.map((card,index)=><article key={card.tag+card.title+card.detail}>
      <div className="stitch-offer-body"><i className="stitch-offer-icon"><StitchSymbol name={["redeem","hotel","luggage"][index]} size={26}/></i><div>
        <span className="stitch-offer-tag">{card.tag}</span><h3>{card.title}</h3><p>{card.detail}</p>
      </div></div>
      <Link href={card.href}>{card.action}<StitchSymbol name="arrow_forward" size={16}/></Link>
    </article>)}</div>
  </section>;
}
