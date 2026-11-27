"use client";
import PackageUnavailable from '@/components/package-unavailable';
import '../packages.css';
export default function PackageError({retry}:{retry:()=>void}){
 return <PackageUnavailable retry={retry}/>;
}
