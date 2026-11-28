import { Capacitor, registerPlugin } from '@capacitor/core';
export type PushPreferences={enabled:boolean;sound:boolean};
export const shopPush=registerPlugin<{
  status():Promise<{configured:boolean;permission:string;bound:boolean}>;
  request():Promise<{configured:boolean;permission:string;bound:boolean}>;
  register(options:{recipientId:string;installationId:string;sound:boolean;companyId?:string}):Promise<{token:string}>;
  clear():Promise<void>;
  preview(options:{kind:'order'|'update'}):Promise<void>;
  settings():Promise<void>;
  consumeTap():Promise<{route?:string;recipientId?:string}>;
  addListener(name:'received'|'opened',callback:()=>void):Promise<{remove():Promise<void>}>;
}>('ShopPush');
export const nativePushSupported=()=>Capacitor.getPlatform()==='android';
let registered=false;
export const nativePushActive=()=>registered;
export const setNativePushActive=(value:boolean)=>{registered=value;};
export function pushPreferences(userId:string):PushPreferences {
  try{return {enabled:true,sound:true,...JSON.parse(localStorage.getItem('shop-push:'+userId)||'{}')};}catch{return {enabled:true,sound:true};}
}
export function setPushPreferences(userId:string,value:PushPreferences) {
  try{localStorage.setItem('shop-push:'+userId,JSON.stringify(value));}catch{}
  window.dispatchEvent(new Event('shop-push-settings'));
}
export function pushInstallationId() {
  let value:string|null=null;
  try{value=localStorage.getItem('shop-push-installation');}catch{}
  if(!value||!/^[-a-f0-9]{36}$/i.test(value)){value=crypto.randomUUID();try{localStorage.setItem('shop-push-installation',value);}catch{}}
  return value;
}
export async function previewPushTone(kind:'order'|'update') {
  if(nativePushSupported())return shopPush.preview({kind});
  const audio=new Audio('/sounds/'+(kind==='order'?'shop_order':'shop_update')+'.wav');await audio.play();
}
