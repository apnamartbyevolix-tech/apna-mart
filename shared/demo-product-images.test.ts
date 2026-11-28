import {describe,it,expect} from 'vitest';
import {demoProductImage} from './demo-product-images';
describe('fictional product photography',()=>{
it('uses a distinct optimized photo for known fictional products',()=>{expect(demoProductImage({name:'Tomatoes — 500 g',isDemo:true})).toBe('/demo-products/tomatoes.webp');expect(demoProductImage({name:'Curd',isDemo:true})).toBe('/demo-products/curd.webp');});
it('preserves every real merchant photo and custom fictional photo',()=>{expect(demoProductImage({name:'Curd',isDemo:false,imageUrl:null})).toBeNull();expect(demoProductImage({name:'Curd',isDemo:true,imageUrl:'/uploads/custom.webp'})).toBe('/uploads/custom.webp');});
it('replaces only the known old generic artwork',()=>{expect(demoProductImage({name:'Curd',isDemo:true,imageUrl:'/manus-storage/async-images/Zrz4ZSFFgmjFx0mYyaO3Zu/image-4.webp'})).toBe('/demo-products/curd.webp');expect(demoProductImage({name:'Unknown',isDemo:true,imageUrl:null})).toBeNull();});
});