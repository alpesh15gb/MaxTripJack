"use client";

import {useEffect,useRef,type ReactNode} from "react";

export function HomeDisclosure({className,title,children}:{className:string;title:string;children:ReactNode}) {
  const disclosure=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const desktop=window.matchMedia("(min-width:701px)");
    const matchLayout=()=>{if(disclosure.current)disclosure.current.open=desktop.matches;};
    matchLayout();
    desktop.addEventListener("change",matchLayout);
    return ()=>desktop.removeEventListener("change",matchLayout);
  },[]);
  return <details ref={disclosure} className={className}><summary>{title}</summary>{children}</details>;
}
