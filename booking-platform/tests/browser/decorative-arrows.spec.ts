import {test,expect,expectNoHorizontalOverflow,capture} from './fixtures';

test('office navigation and booking companion use font-independent decorative arrows',async({page,provider},testInfo)=>{
  await page.goto('/book');
  const office=page.locator('.travel-business-nav');
  await expect(office).toHaveAttribute('href','/office');
  await expect(office).toHaveAccessibleName('Our office');
  const officeIcon=office.locator('svg');
  await expect(officeIcon).toHaveAttribute('aria-hidden','true');
  await expect(officeIcon).toHaveAttribute('width','14');
  const compass=page.locator('#booking-summary .summary-compass');
  await expect(compass).toHaveAttribute('aria-hidden','true');
  await expect(compass.locator('svg')).toHaveAttribute('aria-hidden','true');
  await expect(compass.locator('svg')).toHaveAttribute('width','27');
  for(const decoration of [office.locator('span'),compass]){
    await expect(decoration).toHaveText('');
    await expect(decoration.locator('svg path')).toHaveAttribute('d','M7 17 17 7M7 7h10v10');
  }
  // A font change must not change the SVG or the existing compass container.
  await page.addStyleTag({content:'.travel-business-nav span,.summary-compass{font-family:monospace!important}'});
  await expect(compass).toHaveCSS('width','48px');
  await expect(compass).toHaveCSS('height','48px');
  await expect(compass.locator('svg')).toBeVisible();
  if(testInfo.project.name==='desktop-1440')await expect(officeIcon).toBeVisible();
  else await expect(office).toBeHidden();
  await expectNoHorizontalOverflow(page);
  await capture(page,testInfo,'font-independent-booking-arrows');
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
