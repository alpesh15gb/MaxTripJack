import {permanentRedirect} from 'next/navigation';

export default function LegacyTermsPage() {
  permanentRedirect('/terms-of-use');
}
