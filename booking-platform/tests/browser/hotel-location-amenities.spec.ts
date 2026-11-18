import {test,expect,departure,returning,searchId,expectNoHorizontalOverflow,capture} from './fixtures';

test('hotel location and supplied amenities survive property/back and refresh, with removable filters',async({page,provider},info)=>{
 const property={city:'Mumbai',address:'Synthetic Avenue, Mira Road East, Maharashtra',starRating:3,propertyType:'Hotel',amenities:['Free Wi-Fi','Private parking','Outdoor swimming pool']};
 const hotels=[
  {tjHotelId:'10001',name:'Synthetic Mira Road Stay',customerEstimateMinor:800000,propertyContentStatus:'resolved',property},
  {tjHotelId:'10002',name:'Synthetic Andheri Stay',customerEstimateMinor:900000,propertyContentStatus:'resolved',property:{...property,address:'Synthetic Road, Andheri',amenities:['Wi-Fi','Parking']}},
  {tjHotelId:'10003',name:'Synthetic Mira Mare',customerEstimateMinor:600000,propertyContentStatus:'resolved',property:{city:'Ksamil',address:'Beach Road, Albania',amenities:['No Wi-Fi','Pool table']}},
  {tjHotelId:'10004',name:'Synthetic Missing Details',customerEstimateMinor:500000,propertyContentStatus:'unavailable'},
 ];
 const criteria={product:'HOTEL',city:'Mumbai',hotelIds:'10001,10002,10003,10004',date:departure,end:returning,adults:'3',rooms:JSON.stringify([{adults:2,childAge:[]},{adults:1,childAge:[]}]),nationality:'106'};
 provider.search={searchId,results:{hotels}};
 provider.overrides['POST /api/travel/hotel-detail']={body:{property,options:[{optionId:'synthetic-room-only',roomInfo:[{id:'double',name:'Double room'},{id:'single',name:'Single room'}],mealBasis:'ROOM_ONLY',pricing:{totalPrice:8000,currency:'INR'},cancellation:{isRefundable:false,penalties:[]}}]}};
 provider.overrides['POST /api/travel/hotel-search-snapshot']={body:{searchId,expiresAt:new Date(Date.now()+10*60_000).toISOString(),criteria,results:{hotels}}};
 await page.goto('/book?'+new URLSearchParams({...criteria,autoSearch:'1'}));
 const cards=page.locator('.hotel-shopping-card');
 await expect(cards).toHaveCount(4);
 const mobile=(page.viewportSize()?.width??1440)<=900;
 const dialog=page.getByRole('dialog',{name:'Filter stays',exact:true});
 const openFilters=async()=>{if(mobile){await page.getByRole('button',{name:/^Filters/}).click();await expect(dialog).toBeVisible();}};
 const closeFilters=async()=>{if(mobile){await dialog.getByRole('button',{name:'Close filters',exact:true}).click();await expect(dialog).toBeHidden();}};
 await openFilters();
 await page.getByRole('searchbox',{name:'Area or address',exact:true}).fill('Mira Road');
 await page.getByRole('checkbox',{name:'Wi-Fi',exact:true}).check();
 await page.getByRole('checkbox',{name:'Parking',exact:true}).check();
 await closeFilters();
 await expect(cards).toHaveCount(1);await expect(cards.first()).toContainText('Synthetic Mira Road Stay');
 await expect(cards.first()).toContainText('₹8,000');await expect(cards.first()).toContainText('2 rooms · 3 guests');
 await cards.first().getByRole('button',{name:'Choose room',exact:true}).click();
 await expect(page.locator('#hotel-detail-title')).toHaveText('Synthetic Mira Road Stay');
 await page.getByRole('button',{name:'Back to stays',exact:true}).click();
 await expect(page.locator('#booking-results')).toBeVisible();await expect(cards).toHaveCount(1);
 await openFilters();
 await expect(page.getByRole('searchbox',{name:'Area or address',exact:true})).toHaveValue('Mira Road');
 await expect(page.getByRole('checkbox',{name:'Wi-Fi',exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Parking',exact:true})).toBeChecked();
 await closeFilters();await page.reload();await expect(cards).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Remove area filter',exact:true})).toBeVisible();
 await expectNoHorizontalOverflow(page);await capture(page,info,'hotel-location-amenities-preserved');
 await page.getByRole('button',{name:'Remove area filter',exact:true}).click();await expect(cards).toHaveCount(2);
 await page.getByRole('button',{name:'Remove Parking filter',exact:true}).click();await expect(cards).toHaveCount(2);
 await page.getByRole('button',{name:'Remove Wi-Fi filter',exact:true}).click();await expect(cards).toHaveCount(4);
 expect(provider.requests('/api/travel/search')).toHaveLength(1);expect(provider.requests('/api/travel/hotel-detail')).toHaveLength(1);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
