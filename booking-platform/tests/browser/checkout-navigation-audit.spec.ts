import {test,expect,openFlightSearch,departure,returning,searchId,reviewedQuote,expectNoHorizontalOverflow,capture} from './fixtures';

test('nearby departure dates use submitted criteria and never move the return',async({page,provider})=>{
 await page.goto('/book?'+new URLSearchParams({product:'FLIGHT',from:'BOM',to:'DEL',date:departure,returnDate:departure,adults:'2',children:'1',infants:'1',cabin:'BUSINESS',autoSearch:'1'}));
 const dates=page.getByRole('navigation',{name:'Nearby departure dates'});
 await expect(dates.getByRole('button',{name:/Next day/})).toBeDisabled();
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  const geometry=await dates.evaluate(node=>{const boxes=Array.from(node.children).map(child=>{const box=child.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height};});return {boxes,width:node.getBoundingClientRect().width};});
  const [previous,current,next]=geometry.boxes;
  expect(previous.x+previous.width).toBeLessThanOrEqual(current.x);expect(current.x+current.width).toBeLessThanOrEqual(next.x);
  // An unavailable date has no date sublabel, so its button can be shorter.
  // The three grid cells must still share the same row's vertical centre.
  expect(Math.abs((previous.y+previous.height/2)-(next.y+next.height/2))).toBeLessThan(2);expect(current.width).toBeGreaterThanOrEqual(80);
  expect(previous.height).toBeGreaterThanOrEqual(44);expect(next.height).toBeGreaterThanOrEqual(44);expect(previous.width).toBeLessThan(geometry.width/2);
 }
 await dates.getByRole('button',{name:/Previous day/}).click();
 await expect.poll(()=>provider.requests('/api/travel/search').length).toBe(2);
 const request=provider.requests('/api/travel/search')[1].body as Record<string,unknown>;
 expect(request).toMatchObject({from:'BOM',to:'DEL',returnDate:departure,adults:2,children:1,infants:1,cabin:'BUSINESS'});
 const previous=new Date(`${departure}T12:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);expect(request.date).toBe(previous.toISOString().slice(0,10));
 await expect(dates).not.toContainText('₹');expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('checkout has one submit action on phones and keeps private details through selection changes',async({page,provider},info)=>{
 await page.setViewportSize({width:390,height:844});await openFlightSearch(page);
 await page.locator('.fare-comparison > summary').first().click();await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();
 const form=page.getByRole('form',{name:'Review and travellers'});
 await expect(form.getByRole('button',{name:'Continue to review',exact:true})).toHaveCount(1);
 await expect(form.getByRole('button',{name:'Choose flight extras',exact:true})).toBeHidden();
 await form.getByLabel('First name',{exact:true}).fill('Aarav');await form.getByLabel('Last name',{exact:true}).fill('Example');
 await form.getByLabel('Email',{exact:true}).fill('traveller@example.test');await form.getByLabel('Indian mobile number',{exact:true}).fill('9876543210');
 await form.getByRole('button',{name:'Change selection',exact:true}).click();
 const comparison=page.locator('.fare-comparison').first();if(await comparison.getAttribute('open')===null)await comparison.locator(':scope > summary').click();
 await page.getByRole('button',{name:'Check fare & continue',exact:true}).first().click();
 await expect(form.getByLabel('First name',{exact:true})).toHaveValue('Aarav');
 await expect(form.getByLabel('Email',{exact:true})).toHaveValue('traveller@example.test');
 await form.getByRole('button',{name:'Continue to review',exact:true}).click();
 const action=form.getByRole('button',{name:/^Agree & pay /});await expect(action).toHaveCount(1);await expect(action).toBeInViewport();
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
 await expect(later).toContainText('₹8,100.00');await expect(later).not.toContainText('Unowned metadata');
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
