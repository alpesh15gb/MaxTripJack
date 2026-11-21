"use client";
import Image from 'next/image';
import {useCompanyProfile} from "./company-profile-context";
import './brand-logo.css';

const logoSizes = {
  header: '(max-width: 359px) 130px, (max-width: 760px) 156px, 170px',
  compact: '98px',
  footer: '180px',
  operations: '170px',
};

/** Original owner-supplied artwork, including its tagline and aeroplane. */
export function BrandLogo({variant = 'header'}: {variant?: keyof typeof logoSizes}) {
  const company = useCompanyProfile();
  const custom = Boolean(company.logoDataUrl);
  return <Image
    className={`maxtravel-logo maxtravel-logo--${variant}${custom ? ' maxtravel-logo--custom' : ''}`}
    src={company.logoDataUrl || '/brand/maxtravel-logo.jpg'}
    alt={company.name}
    width={1600}
    height={324}
    sizes={logoSizes[variant]}
    loading={variant === 'footer' ? 'lazy' : 'eager'}
    unoptimized={custom}
  />;
}
