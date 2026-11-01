import Link from 'next/link';
import {TravelHeader,TravelFooter} from './travel-shell';
import {businessProfile} from '@/lib/business-profile';
import {getLegalPolicy,legalPolicies} from '@/lib/legal-policies';
import SeoJsonLd from './seo-json-ld';
import {editorialDiscoveryGraph} from '@/lib/discovery-graph';
import {pageMetadata} from '@/lib/seo';
import {notFound} from 'next/navigation';
import './legal-policy.css';

export function legalPolicyMetadata(slug:string){
 const policy=getLegalPolicy(slug);if(!policy)throw new Error('Unknown policy');
 return pageMetadata(`/${slug}`,policy.title,`Read MaxTravel’s ${policy.title.toLowerCase()} and find our contact details for any questions.`);
}

export function LegalPolicyPage({slug}:{slug:string}){
 const policy=getLegalPolicy(slug);if(!policy)notFound();
 const description=`Read MaxTravel’s ${policy.title.toLowerCase()} and find our contact details for any questions.`;
 const graph=editorialDiscoveryGraph({path:`/${slug}`,title:policy.title,description},[{label:'Home',href:'/'},{label:policy.title,href:`/${slug}`}],{sources:[{label:'View this policy on maxtravel.us',href:policy.sourceUrl}]});
 return <div className="legal-site"><TravelHeader/><main id="main-content" className="legal-main">
  <nav className="legal-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{policy.title}</span></nav>
  <header className="legal-header"><p>MAXTRAVEL · POLICIES & INFORMATION</p><h1>{policy.title}</h1></header>
  <div className="legal-layout"><aside className="legal-sidebar"><nav aria-label="Our policies"><h2>Our policies</h2>{legalPolicies.map(item=><Link key={item.slug} href={`/${item.slug}`} aria-current={item.slug===slug?'page':undefined}>{item.title}<span aria-hidden="true">↗</span></Link>)}</nav><div className="legal-help"><h2>Have a question?</h2><p>Talk to the MaxTravel team.</p><a href={businessProfile.emailHref}>{businessProfile.email}</a><a href={businessProfile.phoneHref}>{businessProfile.phone}</a></div></aside>
   <article className="legal-article" aria-label={policy.title}>{policy.intro.map(paragraph=><p key={paragraph}>{paragraph}</p>)}{policy.sections.map((section,index)=><section id={`policy-section-${index+1}`} key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map(paragraph=><p key={paragraph}>{paragraph}</p>)}{section.bullets.length>0&&<ul>{section.bullets.map(bullet=><li key={bullet}>{bullet}</li>)}</ul>}</section>)}<div className="legal-source"><p>Questions about this policy? <Link href="/contact">Contact MaxTravel</Link>.</p><a href={policy.sourceUrl}>View this policy on maxtravel.us <span aria-hidden="true">↗</span></a></div></article>
  </div>
 </main><TravelFooter/><SeoJsonLd id="maxtravel-policy-schema" data={graph}/></div>;
}
