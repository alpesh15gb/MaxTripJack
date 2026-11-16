import {test,expect,capture,expectNoHorizontalOverflow} from './fixtures';

test('editing or clearing a hotel destination removes old choices before another lookup',async({page},info)=>{
 let lookups=0;
 await page.route('**/api/travel/destinations?*',async route=>{
  lookups++;
  await route.fulfill({json:{destinations:[{region_id:'699356',label:'GOA, INDIA'}]}});
 });
 await page.goto('/book?product=HOTEL');
 const input=page.getByRole('textbox',{name:'Destination',exact:true});
 await input.fill('Goa');
 await expect(page.getByRole('button',{name:'GOA, INDIA',exact:true})).toBeVisible();
 await input.fill('G');
 await expect(page.getByRole('group',{name:'Destination suggestions',exact:true})).toHaveCount(0);
 await expect(input).toHaveValue('G');
 expect(lookups).toBe(1);
 await input.fill('Goa');
 await expect(page.getByRole('button',{name:'GOA, INDIA',exact:true})).toBeVisible();
 await input.fill('');
 await expect(page.getByRole('group',{name:'Destination suggestions',exact:true})).toHaveCount(0);
 await expectNoHorizontalOverflow(page);
 await capture(page,info,'destination-cleared-without-stale-choices');
});

test('an abandoned lookup cannot restore choices for a city the customer has replaced',async({page})=>{
 let release!:()=>void,started=false;
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/travel/destinations?*',async route=>{
  const query=new URL(route.request().url()).searchParams.get('q');
  if(query==='Delhi'){started=true;await held;}
  await route.fulfill({json:{destinations:[{region_id:query==='Delhi'?'123':'699356',label:query==='Delhi'?'DELHI, INDIA':'GOA, INDIA'}]}}).catch(()=>{});
 });
 await page.goto('/book?product=HOTEL');
 const input=page.getByRole('textbox',{name:'Destination',exact:true});
 await input.fill('Goa');
 await expect(page.getByRole('button',{name:'GOA, INDIA',exact:true})).toBeVisible();
 await input.fill('Delhi');
 await expect(page.getByRole('button',{name:'GOA, INDIA',exact:true})).toHaveCount(0);
 try{
  await expect.poll(()=>started).toBe(true);
  await input.fill('G');
 }finally{release();}
 await expect(input).toHaveValue('G');
 await expect(page.getByRole('group',{name:'Destination suggestions',exact:true})).toHaveCount(0);
});

test('an empty destination lookup gives practical guidance without operational jargon',async({page})=>{
 await page.route('**/api/travel/destinations?*',route=>route.fulfill({json:{destinations:[]}}));
 await page.goto('/book?product=HOTEL');
 const input=page.getByRole('textbox',{name:'Destination',exact:true});
 await input.fill('No matching city');
 await expect(page.getByRole('status').filter({hasText:'Try a nearby city or check the spelling.'})).toBeVisible();
 await expect(page.getByRole('main')).not.toContainText('synced by operations');
 await input.fill('N');
 await expect(page.getByRole('status').filter({hasText:'Try a nearby city or check the spelling.'})).toHaveCount(0);
});

test('one city choice keeps continuation hidden and failed mapping can be retried safely',async({page,provider})=>{
 provider.overrides['GET /api/travel/destinations']={body:{destinations:[{region_id:'10',label:'Aurangabad, Maharashtra, India'},{region_id:'11',label:'Aurangabad, Maharashtra, India'},{region_id:'12',label:'Aurangabad, Bihar, India'}]}};
 let attempts=0;
 await page.route('**/api/travel/destination-hotels',async route=>{
  attempts++;
  expect(route.request().postDataJSON()).toEqual({regionId:'10'});
  await route.fulfill(attempts===1?{status:503,json:{error:'Stays are temporarily unavailable. Try again.'}}:{json:{hotelIds:['10001'],nextCursor:'0:1',hasMore:true}});
 });
 await page.goto('/book?product=HOTEL');
 await page.getByRole('textbox',{name:'Destination',exact:true}).fill('Aurangabad');
 const choices=page.getByRole('group',{name:'Destination suggestions'});
 await expect(choices.getByRole('button')).toHaveCount(2);
 await choices.getByRole('button',{name:'Aurangabad, Maharashtra, India',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Stays are temporarily unavailable'})).toBeVisible();
 await choices.getByRole('button',{name:'Aurangabad, Maharashtra, India',exact:true}).click();
 await expect(page.locator('input[name="hotelIds"]')).toHaveValue('10001');
 await expect(page.locator('input[name="destinationCursor"]')).toHaveValue('0:1');
 await expect(page.getByRole('main')).not.toContainText(/Hotel group|Next group|Hotel collection/);
 await expect(page.getByRole('button',{name:'Aurangabad, Maharashtra, India',exact:true})).toHaveCount(0);
 expect(attempts).toBe(2);
});
