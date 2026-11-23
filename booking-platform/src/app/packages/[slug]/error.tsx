"use client";
import PackageUnavailable from '@/components/package-unavailable';
import '../packages.css';
export default function PackageError({reset}:{reset:()=>void}){
 return <PackageUnavailable reset={reset}/>;
}
