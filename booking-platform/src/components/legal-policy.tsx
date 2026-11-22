import Link from 'next/link';
import {TravelHeader,TravelFooter} from './travel-shell';
import {getCompanyProfile} from '@/lib/company-settings';
import {getLegalPolicy,legalContactEmail,legalPolicies} from '@/lib/legal-policies';
import SeoJsonLd from './seo-json-ld';
import {editorialDiscoveryGraph} from '@/lib/discovery-graph';
import {pageMetadata} from '@/lib/seo';
import {notFound} from 'next/navigation';
import './legal-policy.css';
import './public-refresh.css';

export function legalPolicyMetadata(slug:string){
 const policy=getLegalPolicy(slug);if(!policy)throw new Error('Unknown policy');
 return pageMetadata(`/${slug}`,policy.title,`Read MaxTravel’s ${policy.title.toLowerCase()} and find our contact details for any questions.`);
}

function PolicyParagraph({text,linkEmail}:{text:string;linkEmail:boolean}){
 const email=legalContactEmail;
 const parts=linkEmail?text.split(email):[text];
 return <p>{parts.map((part,index)=>index===0?part:<span key={index}><a href={`mailto:${email}`}>{email}</a>{part}</span>)}</p>;
}

export async function LegalPolicyPage({slug}:{slug:string}){
 const businessProfile=await getCompanyProfile();
 const policy=getLegalPolicy(slug);if(!policy)notFound();
 const policyEmail=policy.effectiveDate?legalContactEmail:businessProfile.email;
 const description=`Read MaxTravel’s ${policy.title.toLowerCase()} and find our contact details for any questions.`;
 const graph=editorialDiscoveryGraph({path:`/${slug}`,title:policy.title,description},[{label:'Home',href:'/'},{label:policy.title,href:`/${slug}`}],{businessProfile,sources:policy.sourceUrl?[{label:'View this policy on maxtravel.us',href:policy.sourceUrl}]:[]});
 const sectionLinks=policy.sections.map((section,index)=><a key={section.heading} href={`#policy-section-${index+1}`}>{section.heading}</a>);
 return <div className="legal-site public-refresh"><TravelHeader/><main id="main-content" className="legal-main">
  <nav className="legal-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{policy.title}</span></nav>
  <header className="legal-header"><div><p>POLICIES & INFORMATION</p><h1>{policy.title}</h1>{policy.effectiveDate && <div className="legal-effective-date">Effective date: <time dateTime={policy.effectiveDate}>{policy.effectiveDateLabel}</time></div>}</div><Link className="legal-header-contact" href="/contact">Questions about this policy? <span>Contact our team →</span></Link></header>
  <div className="legal-layout">
   {sectionLinks.length>0&&<details className="legal-mobile-contents"><summary>On this page</summary><nav aria-label="On this page">{sectionLinks}</nav></details>}
   <aside className="legal-sidebar">
   {sectionLinks.length>0&&<nav className="legal-contents" aria-label="On this page"><h2>On this page</h2>{sectionLinks}</nav>}
   <nav aria-label="Our policies"><h2>Our policies</h2>{legalPolicies.map(item=><Link key={item.slug} href={`/${item.slug}`} aria-current={item.slug===slug?'page':undefined}>{item.title}<span aria-hidden="true">↗</span></Link>)}</nav><div className="legal-help"><h2>Have a question?</h2><p>Talk to the MaxTravel team.</p><a href={`mailto:${policyEmail}`}>{policyEmail}</a><a href={businessProfile.phoneHref}>{businessProfile.phone}</a></div></aside>
   <article className="legal-article" aria-label={policy.title}>
    {policy.intro.map(paragraph=><p key={paragraph}>{paragraph}</p>)}
    {policy.sections.map((section,index)=><section id={`policy-section-${index+1}`} key={section.heading}>
     <h2>{section.heading}</h2>
     {section.paragraphs.map(paragraph=><PolicyParagraph key={paragraph} text={paragraph} linkEmail={Boolean(policy.effectiveDate)}/>)}
     {section.bullets.length>0&&<ul>{section.bullets.map(bullet=><li key={bullet}>{bullet}</li>)}</ul>}
     {section.afterBullets?.map(paragraph=><PolicyParagraph key={paragraph} text={paragraph} linkEmail={Boolean(policy.effectiveDate)}/>)}
    </section>)}
    <div className="legal-source"><p>Questions about this policy? <Link href="/contact">Contact MaxTravel</Link>.</p>{policy.sourceUrl&&<a href={policy.sourceUrl}>View this policy on maxtravel.us <span aria-hidden="true">↗</span></a>}</div>
   </article>
  </div>
 </main><TravelFooter/><SeoJsonLd id="maxtravel-policy-schema" data={graph}/></div>;
}
