'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { saveDisplayWorkspace } from '@/lib/display-actions';
import type { DisplayWorkspaces, GridWorkspace } from '@/lib/display-view';
const Context=createContext<{views:DisplayWorkspaces;save:(key:string,value:GridWorkspace)=>Promise<{ok:boolean;message:string}>}|null>(null);
export default function DisplayWorkspace({initial,children}:{initial:DisplayWorkspaces;children:ReactNode}) {
  const [views,setViews]=useState(initial);
  async function save(key:string,value:GridWorkspace){const result=await saveDisplayWorkspace(key,value);if(result.ok)setViews(v=>({...v,[key]:value}));return result;}
  return <Context.Provider value={{views,save}}>{children}</Context.Provider>;
}
export function useDisplayWorkspace(){return useContext(Context);}
