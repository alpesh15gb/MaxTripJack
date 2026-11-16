import {join} from 'node:path';
import PDFDocument from 'pdfkit';
import {defaultCompanySettings,profileFromSettings,type CompanyProfile} from './company-settings-schema';

const ink='#17383e', muted='#577076', teal='#006756', line='#dce6e5';
/** A shared, measured print layout. Keep every content block inside the footer boundary. */
export function voucherLayout(reference:string, title:string, createdAt:string|Date,businessProfile:CompanyProfile=profileFromSettings(defaultCompanySettings)){
 const doc=new PDFDocument({size:'A4',margin:42,bufferPages:true,info:{Title:`${businessProfile.name} ${reference}`,Author:businessProfile.name,CreationDate:new Date(createdAt)}});
 const left=42,width=doc.page.width-84,bottom=752;
 let y=112;
 function header(){
  doc.rect(0,0,doc.page.width,7).fill(teal);
  if(businessProfile.logoDataUrl)doc.image(Buffer.from(businessProfile.logoDataUrl.split(',')[1],'base64'),left,28,{fit:[230,48]});
  else doc.image(join(process.cwd(),'public','brand','maxtravel-logo.jpg'),left,28,{fit:[230,48]});

  doc.font('Helvetica-Bold').fontSize(10).fillColor(teal).text(title,left+270,37,{width:width-270,align:'right'});
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(reference,left+270,57,{width:width-270,align:'right'});
  doc.moveTo(left,89).lineTo(left+width,89).strokeColor(line).stroke();
 }
 header();
 function ensure(height:number){if(y+height>bottom){doc.addPage();header();y=112;}}
 function paragraph(value:string, options:{bold?:boolean;size?:number;color?:string}={}){
  const size=options.size??10;
  doc.font(options.bold?'Helvetica-Bold':'Helvetica').fontSize(size);
  // Split exceptionally long supplier notes by words so they can span pages safely.
  const words=value.split(/\s+/);let chunk='';
  for(const word of words){const next=chunk?`${chunk} ${word}`:word;
   if(chunk&&doc.heightOfString(next,{width,lineGap:3})>490){draw(chunk);chunk=word;}else chunk=next;
  }
  if(chunk)draw(chunk);
  function draw(text:string){
   doc.font(options.bold?'Helvetica-Bold':'Helvetica').fontSize(size);
   const height=doc.heightOfString(text,{width,lineGap:3});ensure(height+9);
   doc.font(options.bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor(options.color??ink).text(text,left,y,{width,lineGap:3});y+=height+9;
  }
 }
 function section(title:string){ensure(72);y+=9;doc.rect(left,y,3,14).fill(teal);doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(title,left+12,y+1,{width:width-12});y+=28;}
 function facts(items:{label:string;value:string}[]){
  const cell=width/items.length;
  const heights=items.map(i=>doc.font('Helvetica-Bold').fontSize(12).heightOfString(i.value,{width:cell-24}));
  const height=Math.max(...heights)+43;ensure(height+12);
  doc.roundedRect(left,y,width,height,6).fill('#eff6f4');
  items.forEach((item,i)=>{const x=left+i*cell+12;doc.font('Helvetica').fontSize(8).fillColor(muted).text(item.label.toUpperCase(),x,y+12,{width:cell-24});doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text(item.value,x,y+28,{width:cell-24});});y+=height+14;
 }
 function row(label:string,value:string){
  doc.font('Helvetica').fontSize(10);const h=Math.max(doc.heightOfString(value,{width:width-145,lineGap:3}),doc.heightOfString(label,{width:130}))+15;
  if(h>490){paragraph(label,{bold:true,size:9,color:muted});paragraph(value);return;}
  ensure(h);
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(label,left,y,{width:130});
  doc.font('Helvetica').fontSize(10).fillColor(ink).text(value,left+145,y,{width:width-145,lineGap:3});
  y+=h;doc.moveTo(left,y-7).lineTo(left+width,y-7).strokeColor(line).stroke();
 }
 function finish(){
  const contact=[
   {text:`${businessProfile.phone}  |  ${businessProfile.email}`,size:10,bold:true},
   {text:`${businessProfile.hours.display}. Manage your booking at ${businessProfile.website}/my-trips.`,size:9,bold:false},
   {text:`${businessProfile.legalName||businessProfile.name} | ${businessProfile.address.display}${businessProfile.gstNumber?` | GSTIN: ${businessProfile.gstNumber}`:''}`,size:8,bold:false},
   {text:'This document records booking status, not payment settlement or a GST tax invoice. Supplier ticket numbers are shown only when returned by the supplier.',size:8,bold:false},
  ];
  const contactHeight=37+contact.reduce((sum,item)=>sum+doc.font(item.bold?'Helvetica-Bold':'Helvetica').fontSize(item.size).heightOfString(item.text,{width,lineGap:3})+9,0);
  ensure(contactHeight);
  section('We are here to help');
  for(const item of contact)paragraph(item.text,{size:item.size,bold:item.bold,color:item.bold?ink:muted});
  const pages=doc.bufferedPageRange();
  for(let i=0;i<pages.count;i++){
   doc.switchToPage(i);doc.moveTo(left,777).lineTo(left+width,777).strokeColor(line).stroke();
   doc.font('Helvetica').fontSize(8).fillColor(muted).text(`${reference}  |  maxtravel.in`,left,789,{width:width-80,lineBreak:false,link:`${businessProfile.website}/my-trips`});
   doc.text(`${i+1} / ${pages.count}`,left+width-65,789,{width:65,align:'right',lineBreak:false});
  }
  doc.end();
 }
 return {doc,paragraph,section,facts,row,finish};
}

export function voucherDate(value:unknown){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(value))return 'Not provided';
 const date=new Date(value.slice(0,10)+'T00:00:00Z');
 return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(date):'Not provided';
}
