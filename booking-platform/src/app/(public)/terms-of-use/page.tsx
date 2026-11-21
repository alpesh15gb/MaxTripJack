import {LegalPolicyPage,legalPolicyMetadata} from '@/components/legal-policy';

export const metadata=legalPolicyMetadata('terms-of-use');

export default function Page(){
 return <LegalPolicyPage slug="terms-of-use"/>;
}
