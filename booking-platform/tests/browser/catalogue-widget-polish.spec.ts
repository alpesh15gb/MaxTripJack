import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import HotelGallery from '../../src/components/hotel-gallery';

const placement = build({entryPoints:['src/components/max-ai-launcher-placement.ts'],bundle:true,platform:'browser',format:'iife',globalName:'LauncherPlacement',write:false}).then(result=>result.outputFiles[0].text);
const launcherMarkup = '<button class="max-ai-launcher" aria-label="Open Max AI travel assistant"><span class="max-ai-launcher-icon"><svg width="22" height="22"></svg></span><span><strong>Max AI</strong><small>Ask your travel assistant</small></span></button><div class="max-ai-mobile-clearance" aria-hidden="true"></div>';

for(const width of [320,390,760,1440])test(`gallery action stays in one contained accessible row at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.route('https://i.travelapi.com/**',route=>route.abort());
  const gallery=renderToStaticMarkup(createElement(HotelGallery,{name:'Synthetic Hotel',photos:[{url:'https://i.travelapi.com/lodging/10000/test.jpg',isHero:true}],open:false,onOpenChange:()=>{}}));
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:18px}button{font:inherit}</style><main>${gallery}</main>`);
  await page.addStyleTag({path:'src/app/hotel-detail.css'});
  const button=page.getByRole('button',{name:'View all 1 photo',exact:true});
  await expect(button).toHaveAttribute('aria-haspopup','dialog');
  const box=await button.boundingBox(),mosaic=await page.locator('.stay-photo-mosaic').boundingBox(),icon=await button.locator('svg').boundingBox(),label=await button.locator('span').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.x).toBeGreaterThan(mosaic!.x);expect(box!.x+box!.width).toBeLessThan(mosaic!.x+mosaic!.width);expect(box!.y+box!.height).toBeLessThan(mosaic!.y+mosaic!.height);
  expect(Math.abs(icon!.y+icon!.height/2-label!.y-label!.height/2)).toBeLessThan(2);
  expect(icon!.x+icon!.width).toBeLessThan(label!.x);
});

for(const width of [320,390,760])test(`compact Max AI avoids scrolling availability and sticky controls at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}main{height:1800px}#availability{position:absolute;left:18px;right:18px;top:764px;display:flex;align-items:center;justify-content:center;min-height:46px;background:#ddd}#pay{position:fixed;bottom:0;left:0;right:0;height:110px;background:white}#pay[hidden]{display:none}</style><main><a id="availability" href="#test">Check test availability</a></main><div id="pay" class="mobile-booking-action" hidden><button>Agree &amp; pay</button></div>${launcherMarkup}`);
  await page.addStyleTag({path:'src/app/max-ai.css'});
  await page.addScriptTag({content:`${await placement}\nwindow.stopPlacement=LauncherPlacement.observeMobileLauncher(document.querySelector('.max-ai-launcher'));`});
  const launcher=page.getByRole('button',{name:'Open Max AI travel assistant'}),action=page.locator('#availability'),bar=page.locator('#pay');
  await expect(launcher).toHaveCSS('width','52px');await expect(launcher).toHaveCSS('height','52px');
  const clears=async(target:typeof action)=>{const launch=await launcher.boundingBox(),obstacle=await target.boundingBox();return Boolean(launch&&obstacle&&(launch.y+launch.height<=obstacle.y-9||launch.y>=obstacle.y+obstacle.height+9||launch.x+launch.width<=obstacle.x-9||launch.x>=obstacle.x+obstacle.width+9));};
  await expect.poll(()=>clears(action)).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,35));await expect.poll(()=>clears(action)).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,200));await expect.poll(()=>clears(action)).toBe(true);
  await page.evaluate(()=>document.querySelector<HTMLElement>('#pay')!.hidden=false);await expect.poll(()=>clears(bar)).toBe(true);
  await expect.poll(()=>page.locator('.max-ai-mobile-clearance').evaluate(element=>element.getBoundingClientRect().height)).toBe(190);
  await page.addStyleTag({content:'.max-ai-launcher{bottom:calc(48px + var(--max-ai-lift,0px))}'});await page.setViewportSize({width,height:843});await expect.poll(()=>clears(bar)).toBe(true);
  await page.evaluate(()=>document.querySelector<HTMLElement>('#pay')!.hidden=true);await expect.poll(async()=>Number.parseFloat(await launcher.evaluate(element=>getComputedStyle(element).bottom))).toBe(48);
  await expect.poll(()=>page.locator('.max-ai-mobile-clearance').evaluate(element=>element.getBoundingClientRect().height)).toBe(80);
  await page.setViewportSize({width:1000,height:844});await expect.poll(()=>launcher.evaluate(element=>element.style.getPropertyValue('--max-ai-lift'))).toBe('');
});
