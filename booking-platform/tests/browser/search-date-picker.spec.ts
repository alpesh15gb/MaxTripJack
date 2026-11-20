import {test,expect,capture,expectNoHorizontalOverflow} from './fixtures';

test('date picker Escape closes from month navigation and restores the field',async({page,provider},testInfo)=>{
 await page.goto('/');
 const field=page.getByRole('button',{name:/^Departure /});await field.click();
 const calendar=page.getByRole('dialog',{name:'Choose departure',exact:true});await expect(calendar).toBeVisible();
 await calendar.getByRole('button',{name:'Next month',exact:true}).focus();
 await capture(page,testInfo,'departure-calendar');await expectNoHorizontalOverflow(page);
 await page.keyboard.press('Escape');await expect(calendar).toBeHidden();await expect(field).toBeFocused();
 expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});

test('date picker month navigation retains a keyboard-selectable day',async({page,provider})=>{
 await page.goto('/');
 await page.getByRole('button',{name:/^Departure /}).click();
 const calendar=page.getByRole('dialog',{name:'Choose departure',exact:true});
 await calendar.getByRole('button',{name:'Next month',exact:true}).click();
 await calendar.getByRole('button',{name:'Next month',exact:true}).click();
 const day=calendar.locator('[role="gridcell"][tabindex="0"]');await expect(day).toHaveCount(1);
 await expect(day).toBeFocused();const selectedDate=await day.getAttribute('data-date');
 await page.keyboard.press('Enter');await expect(calendar).toBeHidden();
 await expect(page.locator('input[type="hidden"][name="date"]')).toHaveValue(selectedDate!);
 expect(provider.requests('/api/travel/review')).toHaveLength(0);expect(provider.requests('/api/payments/create')).toHaveLength(0);
});
