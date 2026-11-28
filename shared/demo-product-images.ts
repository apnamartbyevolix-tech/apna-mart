const images: Record<string,string> = {
  'Toor Dal':'toor-dal','Basmati Rice':'rice','Aashirvaad Atta':'atta','Mustard Oil':'oil',
  'Tomatoes':'tomatoes','Onions':'onions','Potatoes':'potatoes','Spinach':'spinach',
  'Toned Milk':'milk','Curd':'curd','Bread Loaf':'bread','Paneer':'paneer',
  'Blue Ball Pens':'pens','Ruled Notebook':'notebook','HB Pencils':'pencils','Crayons':'crayons',
};
export function demoProductImage(product:{isDemo?:boolean;name:string;imageUrl?:string|null}) {
  const current=product.imageUrl;
  if(!product.isDemo||current&&!/^\/manus-storage\/async-images\/Zrz4ZSFFgmjFx0mYyaO3Zu\/image-[1-5]\.webp$/.test(current))return current;
  const key=images[product.name.replace(/ — (250 g|500 g|2 kg)$/,'')];
  return key?'/demo-products/'+key+'.webp':current;
}
