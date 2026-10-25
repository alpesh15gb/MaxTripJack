import {test,expect,capture,expectNoHorizontalOverflow} from './fixtures';

test('support starts with four actionable customer tasks and verified contact channels',async({page,provider},testInfo)=>{
 await page.goto('/customer-support');
 const main=page.getByRole('main');
 await expect(main).toHaveCount(1);
 await expect(main.getByRole('heading',{level:1,name:'Let’s find your next step.'})).toBeVisible();
 await expect(main.getByRole('article')).toHaveCount(4);
 for(const [name,href] of [['Manage a booking','/my-trips'],['Check booking status','/my-trips'],['Open account help','/account?returnTo=%2Fmy-trips'],['Explore travel packages','/packages']]){
   await expect(main.getByRole('link',{name,exact:true})).toHaveAttribute('href',href);
 }
 const contact=page.getByRole('complementary',{name:'Talk to MaxTravel'});
 await expect(contact.getByRole('link',{name:'Call +91 7095-018-018',exact:true})).toHaveAttribute('href','tel:+917095018018');
 await expect(contact.getByRole('link',{name:/Message on WhatsApp/})).toHaveAttribute('href','https://wa.me/917095018018');
 await expect(contact.getByRole('link',{name:/Message on WhatsApp/})).toHaveAttribute('rel','noopener noreferrer');
 await expect(contact.getByRole('link',{name:'Email max@maxtravel.us',exact:true})).toHaveAttribute('href','mailto:max@maxtravel.us');
 await expect(contact).toContainText('Every day, 9:00 am–9:00 pm (India time)');
 await expect(contact).toContainText('Nothing is sent from this page.');
 await expectNoHorizontalOverflow(page);
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
 await capture(page,testInfo,'support-task-first');
});

test('support questions work by keyboard and disclose actual test and emergency limitations',async({page,provider})=>{
 await page.goto('/customer-support');
 const question=page.locator('summary').filter({hasText:'Can I make a live booking through this website?'});
 await question.focus();
 await page.keyboard.press('Enter');
 const details=question.locator('..');
 await expect(details).toHaveAttribute('open');
 await expect(details).toContainText('Test results and online checkout do not create live travel bookings or payments.');
 await page.keyboard.press('Enter');
 await expect(details).not.toHaveAttribute('open');
 const urgent=page.locator('summary').filter({hasText:'My flight is coming up soon.'});
 await urgent.focus();
 await page.keyboard.press('Enter');
 await expect(urgent.locator('..')).toContainText('We do not provide 24-hour emergency support');
 await expectNoHorizontalOverflow(page);
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
});

test('support booking task reaches an honest authentication gate and preserves account return',async({page,provider})=>{
 provider.session=null;
 provider.overrides['GET /api/bookings']={status:401,body:{error:'Sign in to view your bookings.'}};
 await page.goto('/customer-support');
 await page.getByRole('main').getByRole('link',{name:'Manage a booking',exact:true}).click();
 await expect(page).toHaveURL('/my-trips');
 await expect(page.getByRole('heading',{name:'Your trips are private.'})).toBeVisible();
 await expect(page.getByRole('main').getByRole('alert')).toHaveText('Sign in to view your private booking updates. This does not change your payment or booking status.');
 await expect(page.getByRole('link',{name:'Open account',exact:true})).toHaveAttribute('href','/account?returnTo=%2Fmy-trips');
 expect(provider.calls.filter(call=>call.method!=='GET')).toHaveLength(0);
});
