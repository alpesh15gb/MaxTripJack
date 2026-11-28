import {capture,expect,expectNoHorizontalOverflow,test} from './fixtures';

test('destination directory searches curated places and routes genuine trip-planning actions',async({page,provider},info)=>{
  await page.goto('/');
  await page.getByRole('region',{name:'Popular Holiday Destinations'}).getByRole('link',{name:'All destinations',exact:true}).click();
  await expect(page).toHaveURL('/destinations');
  await expect(page.getByRole('heading',{name:'Explore destinations'})).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(5);
  await page.getByRole('navigation',{name:'Destination themes'}).getByRole('link',{name:'City breaks',exact:true}).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  const search=page.getByRole('searchbox',{name:'Destination or country',exact:true});
  await search.fill('DXB');
  await page.getByRole('search',{name:'Search destinations'}).getByRole('button',{name:'Search',exact:true}).click();
  const dubai=page.getByRole('article',{name:'Dubai',exact:true});
  await expect(dubai).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(dubai.getByRole('link',{name:'Flights',exact:true})).toHaveAttribute('href','/book?product=FLIGHT&to=DXB');
  await expect(dubai.getByRole('link',{name:'Stays',exact:true})).toHaveAttribute('href','/book?product=HOTEL&city=Dubai');
  await expectNoHorizontalOverflow(page);
  await capture(page,info,'destination-directory');
  await dubai.getByRole('link',{name:'Ask about activities',exact:true}).click();
  await expect(page.getByRole('region',{name:'Activities enquiry'}).getByLabel('Message')).toHaveValue('Destination: Dubai');
  expect(provider.requests('/api/travel/search')).toHaveLength(0);
});

test('destination directory can recover from no matching theme and place',async({page})=>{
  await page.goto('/destinations?theme=City+breaks&q=Maldives');
  await expect(page.getByText('No destinations match.',{exact:false})).toBeVisible();
  await page.getByRole('link',{name:'Clear filters',exact:true}).click();
  await expect(page.getByRole('article')).toHaveCount(5);
});
