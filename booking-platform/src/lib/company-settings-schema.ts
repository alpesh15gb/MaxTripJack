import {z} from 'zod';
import {businessProfile} from './business-profile';
const text=(max:number)=>z.string().trim().min(1).max(max).refine(v=>!/[\r\n\x00-\x1f]/.test(v),'Use a single line of text.');
const optionalText=(max:number)=>z.union([text(max),z.literal('')]);
const httpsUrl=z.string().url().max(2000).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;},'Use a public HTTPS link.');
export const weekDays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const;
export const companySettingsSchema=z.object({
 tradingName:text(100),legalName:optionalText(150),gstNumber:z.union([z.string().regex(/^[0-9A-Z]{15}$/),z.literal('')]),
 email:z.string().email().max(200),phone:z.string().regex(/^\+[1-9]\d{7,14}$/,'Use country code, for example +917095018018.'),
 street:text(250),city:text(100),state:text(100),postalCode:z.string().regex(/^\d{6}$/),
 opens:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),closes:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
 days:z.array(z.enum(weekDays)).min(1).max(7).refine(v=>new Set(v).size===v.length),
 mapsUrl:httpsUrl,logoDataUrl:z.string().max(500000).regex(/^(?:|data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2})$/),
}).strict().refine(v=>v.opens<v.closes,{path:['closes'],message:'Closing time must be after opening time (India time).'});
export type CompanySettings=z.infer<typeof companySettingsSchema>;
export const defaultCompanySettings:CompanySettings={tradingName:businessProfile.name,legalName:'',gstNumber:'',email:businessProfile.email,phone:businessProfile.phoneE164,street:businessProfile.address.streetAddress,city:businessProfile.address.addressLocality,state:businessProfile.address.addressRegion,postalCode:businessProfile.address.postalCode,opens:businessProfile.hours.opens,closes:businessProfile.hours.closes,days:[...weekDays],mapsUrl:businessProfile.mapsHref,logoDataUrl:''};
export function profileFromSettings(s:CompanySettings){
 const displayPhone=s.phone.replace(/^(\+91)(\d{5})(\d{5})$/, '$1 $2 $3');
 return {...businessProfile,name:s.tradingName,legalName:s.legalName,gstNumber:s.gstNumber,logoDataUrl:s.logoDataUrl,locationName:`${s.tradingName} ${s.city}`,phone:displayPhone,phoneE164:s.phone,phoneHref:`tel:${s.phone}`,email:s.email,emailHref:`mailto:${s.email}`,mapsHref:s.mapsUrl,
 address:{...businessProfile.address,streetAddress:s.street,addressLocality:s.city,addressRegion:s.state,postalCode:s.postalCode,display:`${s.street}, ${s.city}, ${s.state} - ${s.postalCode}, India`},
 hours:{...businessProfile.hours,opens:s.opens,closes:s.closes,days:weekDays.filter(d=>s.days.includes(d)),display:`${s.days.length===7?'Every day':weekDays.filter(d=>s.days.includes(d)).join(', ')}, ${s.opens} - ${s.closes} (India time)`}};
}
export type CompanyProfile=ReturnType<typeof profileFromSettings>;
