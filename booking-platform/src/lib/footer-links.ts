import {businessProfile} from './business-profile';
// Metadata only: legal document bodies stay out of the client footer bundle.
export const footerPolicyLinks=[
 {label:'Privacy Policy',href:'/privacy-policy'},
 {label:'Terms & Conditions',href:'/terms-and-conditions'},
 {label:'Cancellations & Payment Policy',href:'/cancellations-payment-policy'},
 {label:'Disclaimer',href:'/disclaimer'},
] as const;
export const footerSocialLinks=[
 {name:'facebook',label:'MaxTravel on Facebook',href:businessProfile.socialProfiles[0].href},
 {name:'instagram',label:'MaxTravel on Instagram',href:businessProfile.socialProfiles[1].href},
 {name:'google',label:'Find MaxTravel on Google Maps',href:businessProfile.mapsHref},
] as const;
