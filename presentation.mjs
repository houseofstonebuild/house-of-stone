import { defaultPresentation } from './public/presentation.js';
export function normalizePresentation(input, {field,photo,fail}) {
  if(input!==undefined&&(!input||typeof input!=='object'||Array.isArray(input)))fail('Invalid page content.');
  const result={};
  for(const [key,defaults] of Object.entries(defaultPresentation)){
    const source=input?.[key]||{},page={};
    for(const [name,value] of Object.entries(defaults)){
      if(name==='image')page.image=photo(source.image||'','the '+key+' page image',false);
      else if(name==='gallery'){
        const images=source.gallery||[];if(!Array.isArray(images)||images.length>10)fail('Choose up to ten process photographs.');
        page.gallery=images.map(item=>({image:photo(item.image,'a process photograph',false),caption:field(item.caption,'the process caption',300)}));
      }else if(Array.isArray(value)){
        const entries=source[name]??value;if(!Array.isArray(entries)||entries.length>8)fail('Use up to eight page sections.');
        page[name]=entries.map(item=>({title:field(item?.title,'the section heading',160,true),text:field(item?.text,'the section text',3000,true)}));
      }else page[name]=field(source[name]??value,'the '+key+' '+name,name==='title'?160:3000);
    }
    result[key]=page;
  }
  return result;
}
