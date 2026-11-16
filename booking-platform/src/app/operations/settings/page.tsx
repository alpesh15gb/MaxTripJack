import CompanySettingsForm from '@/components/company-settings-form';
import {privatePageMetadata} from '@/lib/seo';
import './settings.css';
export const metadata=privatePageMetadata('Company settings');
export default function Page(){return <CompanySettingsForm/>;}
