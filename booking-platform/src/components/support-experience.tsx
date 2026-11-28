import Link from 'next/link';
import type { ReactNode } from 'react';
import { accountHref } from '@/lib/account-return';
import { getCompanyProfile } from '@/lib/company-settings';
import { editorialDiscoveryGraph } from '@/lib/discovery-graph';
import { getPublicPage } from '@/lib/public-pages';
import { findSupportQuestions, popularSupportQuestions, supportQuestions, supportTopics, type SupportQuestion } from '@/lib/support-faq';
import BookingLookup from './booking-lookup';
import SeoJsonLd from './seo-json-ld';
import SupportRequestForm from './support-request-form';
import SupportSearch from './support-search';
import { TravelFooter, TravelHeader, TravelIcon } from './travel-shell';
import './support-experience.css';

const supportHref = '/customer-support';
const faqHref = `${supportHref}/faq`;
const requestHref = `${supportHref}/request`;
const account = accountHref('/my-trips');
type Company = Awaited<ReturnType<typeof getCompanyProfile>>;

function SupportPage({ children }: { children: ReactNode }) {
  return <><TravelHeader/><main id="main-content" className="help-page">{children}</main><TravelFooter/></>;
}

function SupportHero({ mode = 'support', initialQuery }: { mode?: 'support' | 'faq' | 'request'; initialQuery?: string }) {
  const request = mode === 'request';
  const title = request ? 'Raise a support request' : mode === 'faq' ? 'Frequently asked questions' : 'How can we help you?';
  return <header className={`help-hero ${request ? 'help-hero--request' : 'help-hero--centered'}`}>
    {!request && <span className="help-hero-mark" aria-hidden="true">FAQ</span>}
    <div className="help-width">
      <nav className="help-breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link><span aria-hidden="true">/</span>
        {mode === 'support' ? <span aria-current="page">Support</span> : <><Link href={supportHref}>Support</Link><span aria-hidden="true">/</span><span aria-current="page">{request ? 'Support request' : 'FAQs'}</span></>}
      </nav>
      <h1>{title}</h1>
      {mode === 'support' && <p>Search our FAQs, raise a request or talk to our travel team.</p>}
      {request ? <p>Tell us what you need and prepare an email to our travel desk.</p> : <SupportSearch key={initialQuery} initialQuery={initialQuery} />}
    </div>
  </header>;
}

function SupportQuestions({ title, questions, query, activeAnswer, more = false }: {
  title: string;
  questions: readonly SupportQuestion[];
  query?: string;
  activeAnswer?: string;
  more?: boolean;
}) {
  return <section className="help-panel help-questions" aria-labelledby="support-answers-heading">
    <div className="help-panel-heading">
      <div><h2 id="support-answers-heading">{title}</h2><p>{query ? `Questions matching “${query}”` : 'Quick answers to common travel questions.'}</p></div>
      {more && <Link href={faqHref}>View all FAQs <TravelIcon name="arrow" size={17}/></Link>}
    </div>
    {questions.length ? questions.map(question => <details id={question.id} key={question.id} open={activeAnswer === question.id || undefined}>
      <summary>{question.title}<TravelIcon name="chevron" size={17}/></summary>
      <div><p>{question.answer}</p><div className="help-answer-actions">
        <Link href={question.action.href}>{question.action.label} <TravelIcon name="arrow" size={16}/></Link>
        <Link href={`${faqHref}?answer=${question.id}#${question.id}`}>Link to this answer</Link>
      </div></div>
    </details>) : <div className="help-empty"><p>No questions match your search.</p><Link href={faqHref}>View all questions</Link></div>}
  </section>;
}

function SupportContact({ company, request = false }: { company: Company; request?: boolean }) {
  const title = request ? 'Other ways to reach us' : 'Talk to MaxTravel';
  return <aside className={`help-panel help-contact${request ? '' : ' help-contact--channels'}`} id="contact-team" aria-labelledby="contact-team-title">
    <h2 id="contact-team-title">{title}</h2>
    <div className="help-contact-row"><span className="help-icon"><TravelIcon name="phone" size={20}/></span><div><span>{company.address.addressLocality} · {company.hours.display}</span><a href={company.phoneHref}>Call {company.phone}</a></div></div>
    <div className="help-contact-row"><span className="help-icon"><TravelIcon name="receipt" size={20}/></span><div><span>Email support</span><a href={company.emailHref}>Email {company.email}</a></div></div>
    <div className="help-contact-row"><span className="help-icon"><TravelIcon name="pin" size={20}/></span><div><span>Office directions and hours</span><Link href="/office">Visit our {company.address.addressLocality} office</Link></div></div>
    {request && <div className="help-contact-links"><Link href={faqHref}>Browse frequently asked questions</Link><Link href="/my-trips">Check my trip status</Link></div>}
    <small>These links open your phone or email app. Nothing is sent from this page.</small>
  </aside>;
}

function SupportActions({ company }: { company: Company }) {
  return <section className="help-actions" aria-label="Ways to get help">
    <article className="help-panel help-card">
      <span className="help-icon"><TravelIcon name="user" size={22}/></span>
      <h2>Sign in to your account</h2><p>See your bookings, confirmations and available travel documents in one place.</p>
      <Link className="help-button" href={account}>Sign in or register</Link>
    </article>
    <article className="help-panel help-card">
      <span className="help-icon"><TravelIcon name="receipt" size={22}/></span>
      <h2>Raise a support request</h2><p>Ask about changes, cancellations, refunds, baggage or anything else.</p>
      <Link className="help-button" href={requestHref}>Raise a request</Link>
      <Link className="help-card-secondary" href="/my-trips">Check booking status <TravelIcon name="arrow" size={15}/></Link>
    </article>
    <article className="help-panel help-card">
      <span className="help-icon"><TravelIcon name="phone" size={22}/></span>
      <h2>Call a travel expert</h2><p>{company.hours.display}</p>
      <div className="help-card-contact"><span>{company.address.addressLocality}</span><a href={company.phoneHref}>{company.phone}</a></div>
      <div className="help-card-contact"><span>Email</span><a href={company.emailHref}>{company.email}</a></div>
    </article>
    <article className="help-panel help-card" id="find-my-trip">
      <span className="help-icon"><TravelIcon name="airplane" size={22}/></span>
      <h2>Find my trip</h2>
      <BookingLookup compact guest emailVerified={false} initiallyOpen />
      <Link className="help-card-secondary" href={account}>Booked on another device?</Link>
    </article>
  </section>;
}

export default async function SupportExperience() {
  const company = await getCompanyProfile();
  const page = getPublicPage('customer-support', company)!;
  const schema = editorialDiscoveryGraph(
    { path: supportHref, title: page.title, description: page.description },
    [{ label:'Home', href:'/' }, { label:'Customer support', href:supportHref }], { businessProfile: company },
  );
  return <SupportPage>
    <SupportHero />
    <div className="help-body help-width help-overlap">
      <SupportActions company={company}/>
      <nav className="help-quick-links" aria-label="Quick links">
        <a href="#find-my-trip"><TravelIcon name="airplane" size={17}/>Find my trip</a>
        <Link href="/my-trips"><TravelIcon name="bag" size={17}/>My bookings</Link>
        <Link href={requestHref}><TravelIcon name="receipt" size={17}/>Support request</Link>
        <Link href={`${faqHref}?topic=refunds`}><TravelIcon name="refresh" size={17}/>Cancellations &amp; refunds</Link>
        <Link href={faqHref}><TravelIcon name="search" size={17}/>All FAQs</Link>
      </nav>
      <SupportQuestions title="Popular questions" questions={popularSupportQuestions} more />
      <section className="help-browse" aria-labelledby="browse-support-heading">
        <h2 id="browse-support-heading">Browse by topic</h2>
        <div>{supportTopics.map(topic => <Link className="help-panel" key={topic.id} href={`${faqHref}?topic=${topic.id}`}>
          <span className="help-icon"><TravelIcon name={topic.icon} size={20}/></span><div><h3>{topic.title}</h3><p>{topic.description}</p></div><TravelIcon name="arrow" size={17}/>
        </Link>)}</div>
      </section>
      <SupportContact company={company}/>
    </div>
    <SeoJsonLd data={schema}/>
  </SupportPage>;
}

export function SupportFaqExperience({ query, topic, answer }: { query: string; topic?: string; answer?: string }) {
  const selectedTopic = supportTopics.find(item => item.id === topic);
  const selectedAnswer = supportQuestions.find(question => question.id === answer);
  const activeTopic = selectedAnswer?.topic ?? selectedTopic?.id;
  const topicTitle = supportTopics.find(item=>item.id===activeTopic)?.title;
  const title = query ? 'Search results' : topicTitle ?? 'Popular topics';
  const questions = activeTopic || query ? findSupportQuestions(query, activeTopic) : popularSupportQuestions;
  const topicLinks = <nav aria-label="FAQ topics">
    <Link href={faqHref} aria-current={!activeTopic && !query ? 'page' : undefined}>Popular topics</Link>
    {supportTopics.map(item => <Link href={`${faqHref}?topic=${item.id}`} key={item.id} aria-current={activeTopic === item.id && !query ? 'page' : undefined}>{item.title}</Link>)}
  </nav>;
  return <SupportPage>
    <SupportHero mode="faq" initialQuery={query} />
    <div className="help-width help-body help-overlap help-faq-layout">
      <aside className="help-panel help-faq-topics">
        <div className="help-faq-topics-desktop">{topicLinks}</div>
        <details className="help-faq-topics-mobile" key={activeTopic??'popular'}><summary>FAQ topics <span>{topicTitle??'Popular topics'}</span><TravelIcon name="chevron" size={16}/></summary>{topicLinks}</details>
        <div className="help-faq-escalation"><p>Still need help?</p><Link className="help-button" href={requestHref}>Raise a support request</Link></div>
      </aside>
      <SupportQuestions title={title} questions={questions} query={query} activeAnswer={selectedAnswer?.id}/>
      <section className="help-panel help-faq-escalation-mobile"><h2>Still need help?</h2><Link className="help-button" href={requestHref}>Raise a support request</Link></section>
    </div>
  </SupportPage>;
}

export async function SupportRequestExperience() {
  const company = await getCompanyProfile();
  return <SupportPage>
    <SupportHero mode="request" />
    <div className="help-width help-body help-overlap help-request-layout">
      <SupportRequestForm emailHref={company.emailHref} />
      <SupportContact company={company} request />
    </div>
  </SupportPage>;
}
