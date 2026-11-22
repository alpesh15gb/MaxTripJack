import {test,expect,expectNoHorizontalOverflow,capture} from './fixtures';

test('office navigation keeps its decorative arrow and booking help links are reachable',async({page,provider},testInfo)=>{
  await page.goto('/book');
  await expect(page.getByRole('contentinfo')).toBeVisible();
  const directory = page.locator('.concierge-mobile-directory > summary');
  if (await directory.isVisible()) await directory.click();
  const office=page.getByRole('link',{name:'Visit our office',exact:true});
  await expect(office).toHaveAttribute('href','/office');
  await expect(office).toHaveText('Visit our office');
  const officeIcon=office.locator('svg');
  await expect(officeIcon).toHaveAttribute('aria-hidden','true');
  await expect(officeIcon).toHaveAttribute('width','14');
  await expect(office.locator('span')).toHaveText('');
  await expect(officeIcon.locator('path')).toHaveAttribute('d','M7 17 17 7M7 7h10v10');
  await page.addStyleTag({content:'.travel-business-nav span{font-family:monospace!important}'});
  await expect(officeIcon).toBeVisible();
  await expect(office).toHaveAccessibleName('Visit our office');
  const help=page.getByRole('complementary',{name:'Your journey summary'});
  await expect(help.getByRole('link',{name:'Get booking help'})).toHaveAttribute('href','/customer-support');
  await expect(help.getByRole('link',{name:'Find an existing booking'})).toHaveAttribute('href','/my-trips');
  await expectNoHorizontalOverflow(page);
  await capture(page,testInfo,'font-independent-booking-arrows');
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
