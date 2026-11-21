import {test,expect,expectNoHorizontalOverflow,capture} from './fixtures';

test('office navigation and booking companion use font-independent decorative arrows',async({page,provider},testInfo)=>{
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
  // The planning photo replaces this redundant decoration; retained SVG markup
  // stays font-independent without introducing another visible compass.
  await expect(compass.locator('svg')).toBeHidden();
  await expect(officeIcon).toBeVisible();
  await expect(office).toHaveAccessibleName('Visit our office');
  await expectNoHorizontalOverflow(page);
  await capture(page,testInfo,'font-independent-booking-arrows');
  expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
