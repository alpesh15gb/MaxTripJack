"use client";
import {useCompanyProfile} from "./company-profile-context";
import Image from 'next/image';
import './brand-logo.css';

/** Original owner-supplied artwork, including its tagline and aeroplane. */
export function BrandLogo({variant='header'}:{variant?:'header'|'footer'|'operations'}){
 const company=useCompanyProfile();
 return <Image className={`maxtravel-logo maxtravel-logo--${variant}${company.logoDataUrl?' maxtravel-logo--custom':''}`} src={company.logoDataUrl||"/brand/maxtravel-logo.jpg"} unoptimized={Boolean(company.logoDataUrl)} alt={company.name} width={1600} height={324} sizes={variant==='operations'?'175px':variant==='footer'?'270px':'(max-width:360px) 156px, (max-width:700px) 190px, (max-width:1100px) 184px, 242px'} loading={variant==='footer'?'lazy':'eager'} fetchPriority={variant==='header'?'low':undefined}/>;
}
