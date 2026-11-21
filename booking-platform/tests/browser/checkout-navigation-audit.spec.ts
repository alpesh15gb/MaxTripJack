import {test,expect,openFlightSearch,departure,returning,searchId,reviewedQuote,expectNoHorizontalOverflow,capture} from './fixtures';
import {travelDateLabel} from '../../src/lib/travel-date';
import {indiaToday} from '../../src/lib/booking-presentation';

function shiftedDate(date:string,days:number){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}

test('nearby departure dates use submitted criteria and never move the return',async({page,provider})=>{
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,returnDate:departure,adults:'2',children:'1',infants:'1',cabin:'BUSINESS',autoSearch:'1'}));
 const dates=page.getByRole('navigation',{name:'Nearby departure dates'});
 const days=dates.locator('[data-flight-date-track] button[data-flight-date]');
 await expect(days).toHaveCount(15);
 await expect(dates.locator(`[data-flight-date="${departure}"]`)).toHaveAttribute('aria-current','date');
 await expect(dates.locator(`[data-flight-date="${shiftedDate(departure,1)}"]`)).toBeDisabled();
 for(const date of await days.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-flight-date')!))){if(date>departure)await expect(dates.locator(`[data-flight-date="${date}"]`)).toBeDisabled();}
 const previous=shiftedDate(departure,-3);
 await dates.getByRole('button',{name:new RegExp(`^${travelDateLabel(previous)}`)}).click();
 await expect.poll(()=>provider.requests('/api/travel/search').length).toBe(2);
 const request=provider.requests('/api/travel/search')[1].body as Record<string,unknown>;
 expect(request).toMatchObject({from:'BOM',to:'DEL',returnDate:departure,adults:2,children:1,infants:1,cabin:'BUSINESS'});
 expect(request.date).toBe(previous);
 await expect(dates.locator(`[data-flight-date="${previous}"]`)).toHaveAttribute('aria-current','date');
 await expect(dates.locator('button[aria-current="date"]')).toHaveCount(1);
 // Generic one-way estimates don't describe a journey with this fixed return.
 await expect(dates).toContainText(`Return stays ${travelDateLabel(departure)}`);
 await expect(dates).not.toContainText('₹');
 expect(provider.requests('/api/travel/fare-calendar')).toHaveLength(0);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('15-day flight timeline shows seven desktop dates and browses both ends without searching',async({page,provider,isMobile},info)=>{
 const cachedDays=Object.fromEntries(Array.from({length:15},(_,index)=>[shiftedDate(departure,index-7),{minor:400000+index*1300,band:'mid'}]));
 provider.overrides['GET /api/travel/fare-calendar']={body:{days:cachedDays,pending:[]}};
 provider.overrides['POST /api/travel/fare-calendar']={status:204,body:null};
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:1440,height:1000});await openFlightSearch(page);
 const dates=page.getByRole('navigation',{name:'Nearby departure dates'}),track=dates.locator('[data-flight-date-track]'),days=track.locator('button[data-flight-date]');
 await expect(days).toHaveCount(15);
 const listed=await days.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-flight-date')!));
 expect(listed[0]).toBe(shiftedDate(departure,-7));expect(listed[14]).toBe(shiftedDate(departure,7));
 expect(new Set(listed).size).toBe(15);for(let index=1;index<listed.length;index++)expect(listed[index]).toBe(shiftedDate(listed[index-1],1));
 for(const date of listed)await expect(dates.locator(`[data-flight-date="${date}"]`)).toHaveAccessibleName(new RegExp(`^${travelDateLabel(date)}`));
 const visibleDates=()=>track.evaluate(element=>{
  const bounds=element.getBoundingClientRect();
  return Array.from(element.querySelectorAll<HTMLButtonElement>('button[data-flight-date]')).filter(button=>{
   const box=button.getBoundingClientRect();return box.left>=bounds.left-1&&box.right<=bounds.right+1;
  }).map(button=>button.dataset.flightDate);
 });
 await expect.poll(visibleDates).toEqual(listed.slice(4,11));
 await expect(days.nth(7).locator('.flight-date-fare')).toContainText('₹');
 await expect.poll(()=>provider.requests('/api/travel/fare-calendar').filter(request=>request.method==='POST').length).toBe(1);
 await expectNoHorizontalOverflow(page);await capture(page,info,'flight-date-timeline-desktop');
 const searches=provider.requests('/api/travel/search').length;
 const calendarReads=provider.requests('/api/travel/fare-calendar').length;
 const earlier=dates.getByRole('button',{name:'Earlier dates',exact:true});
 const later=dates.getByRole('button',{name:'Later dates',exact:true});
 await earlier.click();await expect(earlier).toBeDisabled();
 await expect.poll(visibleDates).toEqual(listed.slice(0,7));
 await later.click();await later.click();await expect(later).toBeDisabled();
 await expect.poll(visibleDates).toEqual(listed.slice(8));
 await days.last().focus();await page.keyboard.press('Home');await expect(days.first()).toBeFocused();
 await expect.poll(visibleDates).toEqual(listed.slice(0,7));
 await page.keyboard.press('End');await expect(days.last()).toBeFocused();
 await expect.poll(visibleDates).toEqual(listed.slice(8));
 await expect(days.nth(7)).toHaveAttribute('aria-current','date');
 expect(provider.requests('/api/travel/search')).toHaveLength(searches);
 expect(provider.requests('/api/travel/fare-calendar')).toHaveLength(calendarReads);
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});await track.scrollIntoViewIfNeeded();
  const geometry=await track.evaluate(node=>({width:node.clientWidth,content:node.scrollWidth,overflow:getComputedStyle(node).overflowX,boxes:Array.from(node.querySelectorAll('button[data-flight-date]')).map(button=>{const rect=button.getBoundingClientRect();return {y:rect.y,height:rect.height,width:rect.width};})}));
  expect(geometry.content).toBeGreaterThan(geometry.width);expect(['auto','scroll']).toContain(geometry.overflow);
  for(const box of geometry.boxes){expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);expect(Math.abs(box.y-geometry.boxes[0].y)).toBeLessThan(2);}
  const earlier=dates.getByRole('button',{name:'Earlier dates',exact:true}),later=dates.getByRole('button',{name:'Later dates',exact:true});
  await expect(earlier).toBeVisible();await expect(later).toBeVisible();
  await capture(page,info,`flight-date-timeline-centered-${width}`);
  if(await earlier.isEnabled()){const position=await track.evaluate(node=>node.scrollLeft);await earlier.click();await expect.poll(()=>track.evaluate(node=>node.scrollLeft)).toBeLessThan(position);}
  await track.evaluate(node=>node.scrollTo({left:0,behavior:'instant'}));
  const before=await track.evaluate(node=>node.scrollLeft);
  await later.click();
  await expect.poll(()=>track.evaluate(node=>node.scrollLeft)).toBeGreaterThan(before);
  await expect(dates.locator(`[data-flight-date="${departure}"]`)).toHaveAttribute('aria-current','date');
  expect(provider.requests('/api/travel/search')).toHaveLength(searches);
  if(isMobile){
   // Use a real touch gesture rather than assigning scrollLeft to prove swiping works.
   await track.evaluate(node=>node.scrollTo({left:0,behavior:'instant'}));
   const bounds=await track.boundingBox();expect(bounds).not.toBeNull();
   const session=await page.context().newCDPSession(page);
   try{
    const x=bounds!.x+bounds!.width-24,y=bounds!.y+bounds!.height/2;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(const distance of [30,70,110,150])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-distance,y}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>track.evaluate(node=>node.scrollLeft)).toBeGreaterThan(30);
   }finally{await session.detach();}
   expect(provider.requests('/api/travel/search')).toHaveLength(searches);
  }
  await expectNoHorizontalOverflow(page);await capture(page,info,`flight-date-timeline-${width}`);
 }
 expect(provider.requests('/api/travel/fare-calendar')).toHaveLength(calendarReads);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('flight date timeline supports keyboard browsing and restores focus after selection',async({page,provider})=>{
 await openFlightSearch(page);
 const dates=page.getByRole('navigation',{name:'Nearby departure dates'});
 const selected=dates.locator(`[data-flight-date="${departure}"]`);
 const next=dates.locator(`[data-flight-date="${shiftedDate(departure,1)}"]`);
 await selected.focus();
 await page.keyboard.press('ArrowRight');
 await expect(next).toBeFocused();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 await page.keyboard.press('Enter');
 await expect(next).toHaveAttribute('aria-current','date');
 await expect(next).toBeFocused();
 expect(provider.requests('/api/travel/search')).toHaveLength(2);
});

test('flight timeline starts today instead of offering past departure dates',async({page,provider})=>{
 const today=indiaToday();
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:today,adults:'1',autoSearch:'1'}));
 const dates=page.getByRole('navigation',{name:'Nearby departure dates'}),days=dates.locator('[data-flight-date-track] button[data-flight-date]');
 await expect(days).toHaveCount(15);await expect(days.first()).toHaveAttribute('data-flight-date',today);
 await expect(days.last()).toHaveAttribute('data-flight-date',shiftedDate(today,14));
 await expect(dates.locator('button[aria-current="date"]')).toHaveAttribute('data-flight-date',today);
 expect((await days.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-flight-date')!))).every(date=>date>=today)).toBe(true);
 await expect.poll(()=>provider.requests('/api/travel/fare-calendar').find(call=>call.method==='GET')?.query).toMatchObject({start:today,days:'15'});
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('checkout has one submit action on phones and keeps private details through selection changes',async({page,provider},info)=>{
 await page.setViewportSize({width:390,height:844});await openFlightSearch(page);
 await page.locator('.fare-comparison > summary').first().click();await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();
 const form=page.getByRole('form',{name:'Review and travellers'});
 await expect(form.getByRole('button',{name:/^Agree & pay /})).toHaveCount(1);
 await expect(form.getByRole('button',{name:'Choose flight extras',exact:true})).toBeHidden();
 await form.getByLabel('First name',{exact:true}).fill('Aarav');await form.getByLabel('Last name',{exact:true}).fill('Example');
 await form.getByLabel('Email',{exact:true}).fill('traveller@example.test');await form.getByLabel('Indian mobile number',{exact:true}).fill('9876543210');
 await form.getByRole('button',{name:'Change selection',exact:true}).click();
 const comparison=page.locator('.fare-comparison').first();if(await comparison.getAttribute('open')===null)await comparison.locator(':scope > summary').click();
 await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();
 await expect(form.getByLabel('First name',{exact:true})).toHaveValue('Aarav');
 await expect(form.getByLabel('Email',{exact:true})).toHaveValue('traveller@example.test');
 await expect(page.locator('#booking-summary').getByRole('heading',{name:'Review your booking',exact:true})).toBeVisible();
 const action=form.getByRole('button',{name:/^Agree & pay /});await expect(action).toHaveCount(1);await action.scrollIntoViewIfNeeded();await expect(action).toBeInViewport();
 await page.locator('.checkout-price-breakdown > summary').click();await expect(page.locator('.checkout-price-breakdown')).toContainText('Reviewed fare');
 await expectNoHorizontalOverflow(page);await capture(page,info,'single-mobile-checkout-action');
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('more hotel batches retain source ownership through empty pages, retry and property reload',async({page,provider})=>{
 const laterSearch='77777777-7777-4777-8777-777777777777';
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'First batch stay',customerEstimateMinor:654000}]}};
 const criteria={product:'HOTEL',hotelIds:'10001',regionId:'1001',destinationCursor:'0:1',city:'Goa',date:departure,end:returning,adults:'1',autoSearch:'1'};
 await page.goto('/book?'+new URLSearchParams(criteria));
 await expect(page.getByRole('heading',{name:'First batch stay',exact:true})).toBeVisible();
 provider.overrides['POST /api/travel/destination-hotels']={body:{hotelIds:[],nextCursor:'0:2',hasMore:true}};
 await page.getByRole('button',{name:'Load more stays',exact:true}).click();await expect(page.getByText('No stays in this batch.',{exact:false})).toBeVisible();
 expect(provider.requests('/api/travel/search')).toHaveLength(1);
 provider.overrides['POST /api/travel/destination-hotels']={body:{hotelIds:['10001','10002'],nextCursor:null,hasMore:false}};
 provider.overrides['POST /api/travel/search']={status:503,body:{error:'Temporary availability failure'}};
 await page.getByRole('button',{name:/Load more stays|Retry loading stays/}).click();await expect(page.getByText('Temporary availability failure',{exact:true})).toBeVisible();
 delete provider.overrides['POST /api/travel/search'];
 provider.search={searchId:laterSearch,results:{hotels:[{tjHotelId:'10001',name:'Duplicate stay',customerEstimateMinor:640000},{tjHotelId:'10002',name:'Later batch stay',customerEstimateMinor:654000}]}};
 await page.getByRole('button',{name:/Retry loading stays/}).click();
 await expect(page.getByRole('heading',{name:'Later batch stay',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Duplicate stay',exact:true})).toHaveCount(0);
 const cursors=provider.requests('/api/travel/destination-hotels').map(request=>(request.body as {cursor:string}).cursor);expect(cursors).toEqual(['0:1','0:2','0:2']);
 await page.locator('.hotel-shopping-card').filter({has:page.getByRole('heading',{name:'Later batch stay',exact:true})}).getByRole('button',{name:'Choose room',exact:true}).click();
 await expect.poll(()=>provider.requests('/api/travel/hotel-detail').at(-1)?.body).toEqual({searchId:laterSearch,hid:'10002'});
 provider.overrides['POST /api/travel/hotel-search-snapshot']={body:{...(provider.search as object),criteria:{...criteria,hotelIds:'10001,10002'},expiresAt:new Date(Date.now()+600000).toISOString()}};
 await page.reload();await expect(page.getByRole('heading',{name:'Later batch stay',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back to stays',exact:true}).click();
 provider.overrides['POST /api/travel/destination-hotels']={body:{hotelIds:[],nextCursor:null,hasMore:false}};
 await page.getByRole('button',{name:'Load more stays',exact:true}).click();expect(provider.requests('/api/travel/destination-hotels').at(-1)?.body).toMatchObject({cursor:'0:0'});
 provider.quote=reviewedQuote({product:'HOTEL',summary:{checkIn:departure,checkOut:returning,adults:1,rooms:[{adults:1,children:0,childAge:[]}]}});
 await page.locator('.hotel-shopping-card').filter({has:page.getByRole('heading',{name:'Later batch stay',exact:true})}).getByRole('button',{name:'Choose room',exact:true}).click();
 await page.getByRole('button',{name:'Continue with room',exact:true}).first().click();
 await expect(page.getByRole('form',{name:'Review and travellers'})).toBeVisible();expect(provider.requests('/api/travel/review').at(-1)?.body).toMatchObject({searchId:laterSearch,hid:'10002'});
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('mismatched later-batch metadata settles unavailable without replacing base properties or rates',async({page,provider})=>{
 const laterSearch='77777777-7777-4777-8777-777777777777';
 provider.search={searchId,results:{hotels:[{tjHotelId:'10001',name:'Cached base stay',customerEstimateMinor:654000,propertyContentStatus:'resolved',property:{address:'Verified base address'}}]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds:'10001',regionId:'1001',destinationCursor:'0:1',city:'Goa',date:departure,end:returning,adults:'1',autoSearch:'1'}));
 await expect(page.getByRole('article',{name:'Cached base stay'})).toContainText('Verified base address');
 provider.overrides['POST /api/travel/destination-hotels']={body:{hotelIds:['10002'],nextCursor:null,hasMore:false}};
 provider.search={searchId:laterSearch,propertyContentPending:true,results:{hotels:[{tjHotelId:'10002',name:'Later metadata stay',customerEstimateMinor:810000,propertyContentStatus:'pending'}]}};
 provider.overrides['POST /api/travel/hotel-content']={body:{searchId,properties:{'10001':{address:'Wrong replacement'},'10002':{address:'Unowned metadata'}}}};
 await page.getByRole('button',{name:'Load more stays',exact:true}).click();
 const later=page.getByRole('article',{name:'Later metadata stay'});
 await expect(later).toContainText('Property photos unavailable right now');await expect(later).not.toContainText('loading…');
 await expect(later).toContainText('₹8,100');await expect(later).not.toContainText('Unowned metadata');
 await expect(page.getByRole('article',{name:'Cached base stay'})).toContainText('Verified base address');
 await expect(later.getByRole('button',{name:'Choose room',exact:true})).toBeEnabled();
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('an oversized valid hotel URL keeps complete public criteria for destination continuation in the mounted tab',async({page,provider})=>{
 const hotelIds=Array.from({length:100},(_,index)=>'1000000000000000'+String(index).padStart(3,'0')).join(',');
 const rooms=[{adults:2,childAge:[5,8]}];
 provider.search={searchId,results:{hotels:[{tjHotelId:hotelIds.split(',')[0],name:'Large inventory stay',customerEstimateMinor:654000}]}};
 await page.goto('/book?'+new URLSearchParams({product:'HOTEL',hotelIds,regionId:'1001',destinationCursor:'0:1',city:'Goa',date:departure,end:returning,adults:'2',rooms:JSON.stringify(rooms),nationality:'106',autoSearch:'1'}));
 await expect(page.getByRole('heading',{name:'Large inventory stay',exact:true})).toBeVisible();await expect(page).toHaveURL(/\/book\?product=HOTEL$/);
 provider.overrides['POST /api/travel/destination-hotels']={body:{hotelIds:['10002'],nextCursor:null,hasMore:false}};
 provider.search={searchId:'77777777-7777-4777-8777-777777777777',results:{hotels:[{tjHotelId:'10002',name:'Continued inventory stay',customerEstimateMinor:810000}]}};
 await page.getByRole('button',{name:'Load more stays',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Continued inventory stay',exact:true})).toBeVisible();
 expect(provider.requests('/api/travel/destination-hotels').at(-1)?.body).toEqual({regionId:'1001',cursor:'0:1'});
 expect(provider.requests('/api/travel/search')[0].body).toMatchObject({hotelIds:hotelIds.split(',')});
 expect(provider.requests('/api/travel/search').at(-1)?.body).toMatchObject({hotelIds:['10002'],checkIn:departure,checkOut:returning,adults:2,rooms:[{adults:2,children:2,childAge:[5,8]}],childrenAges:[5,8],nationality:'106'});
 expect(await page.evaluate(()=>JSON.stringify(sessionStorage))).not.toContain(hotelIds);
 expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
