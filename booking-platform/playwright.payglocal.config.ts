import {defineConfig} from '@playwright/test';
import config from './playwright.config';
export default defineConfig({...config,testMatch:'**/checkout-unavailable.spec.ts',testIgnore:[],projects:config.projects,outputDir:'test-results-payglocal',reporter:[['list'],['html',{outputFolder:'playwright-report-payglocal',open:'never'}]],webServer:{...config.webServer,command:'npm run start -- --hostname 127.0.0.1 --port 3100',url:'http://127.0.0.1:3100',reuseExistingServer:false,env:{NEXT_TELEMETRY_DISABLED:'1',PAYMENT_PROVIDER:'PAYGLOCAL'}}});
