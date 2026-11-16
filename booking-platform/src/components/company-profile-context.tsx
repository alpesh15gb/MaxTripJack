'use client';
import {createContext,useContext} from 'react';
import {defaultCompanySettings,profileFromSettings,type CompanyProfile} from '@/lib/company-settings-schema';
const Context=createContext<CompanyProfile>(profileFromSettings(defaultCompanySettings));
export const CompanyProfileProvider=Context.Provider;
export const useCompanyProfile=()=>useContext(Context);
