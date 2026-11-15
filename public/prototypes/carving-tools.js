// Contact-anchored workshop tool animation: scroll-synchronized with real stone removal.
// The hammer hits the chisel butt; the chisel tip stays planted in the sculpture.
// Renders vector paths only, with no WebGL or new image decoding on phones.
export function createCarvingTools(host){
 const wrapper=document.createElement('div');
 wrapper.id='carving-tools';wrapper.className='carving-tools';
 wrapper.setAttribute('role','img');
 wrapper.setAttribute('aria-label','Illustration of a mallet striking a steel chisel against stone');
 wrapper.setAttribute('aria-hidden','true');
 wrapper.innerHTML=`<svg viewBox="0 0 360 330" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs>
 <linearGradient id="tool-steel" x1="0" y1="0" x2="1" y2=".25">
  <stop stop-color="#222b2b"/><stop offset=".21" stop-color="#a6b2b1"/>
  <stop offset=".39" stop-color="#e2e6dd"/><stop offset=".55" stop-color="#849191"/>
  <stop offset=".81" stop-color="#424d4c"/><stop offset="1" stop-color="#202829"/>
 </linearGradient>
 <linearGradient id="tool-wood" x1="0" y1="0" x2="1" y2=".75">
  <stop stop-color="#4a3324"/><stop offset=".17" stop-color="#c5a276"/>
  <stop offset=".35" stop-color="#ae8152"/><stop offset=".66" stop-color="#795438"/>
  <stop offset=".9" stop-color="#38291f"/><stop offset="1" stop-color="#281c17"/>
 </linearGradient>
 <linearGradient id="tool-hammer" x1="0" y1="0" x2="0" y2="1">
  <stop stop-color="#bec7c2"/><stop offset=".12" stop-color="#657272"/>
  <stop offset=".35" stop-color="#b9c3bf"/><stop offset=".59" stop-color="#3c4a4b"/>
  <stop offset=".81" stop-color="#81908b"/><stop offset="1" stop-color="#323c3e"/>
 </linearGradient>
 <filter id="tool-shadow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur stdDeviation="4"/>
 </filter>
</defs>
<g id="tool-chisel">
 <path d="M57 271 L126 126 L142 135 L68 273Z" fill="#030807" opacity=".24" filter="url(#tool-shadow)" transform="translate(7 8)"/>
 <path d="M57 271 L120 131 L133 139 L66 272 L60 278Z" fill="url(#tool-steel)" stroke="#4d5957" stroke-width="1.3"/>
 <path d="M60 271 L123 133" stroke="#e5e7db" stroke-opacity=".67" stroke-width="2.3"/>
 <path d="M59 273 L67 273 L60 281Z" fill="#abbab6"/>
 <path d="M117 136 L135 103 L157 116 L135 149Z" fill="#44473d" stroke="#29332f"/>
 <path d="M124 132 L160 65 Q170 48 181 56 L187 61 Q195 67 188 78 L145 148Z"
  fill="url(#tool-wood)" stroke="#342b23" stroke-width="2"/>
 <path d="M137 128 L171 69" stroke="#e5c299" stroke-width="1.5" stroke-opacity=".52"/>
 <path d="M161 61 Q171 46 182 54 L190 60 L183 74 L158 71Z"
  fill="url(#tool-hammer)" stroke="#53615e" stroke-width="1.5"/>
</g>
<g id="tool-mallet">
 <path d="M224 56 L246 65 L322 173 L308 186 L230 80Z" fill="#060b0a" opacity=".24" filter="url(#tool-shadow)" transform="translate(5 6)"/>
 <path d="M219 59 L238 68 L313 165 Q318 171 313 178 L309 184 Q302 190 296 181 L224 77Z"
  fill="url(#tool-wood)" stroke="#3e3025" stroke-width="2.3"/>
 <path d="M234 76 L300 174" stroke="#e6c398" stroke-opacity=".57" stroke-width="2"/>
 <path d="M184 19 Q172 20 171 31 L171 59 Q172 69 184 71 L250 69 Q263 67 263 55 L263 33 Q263 20 251 18Z"
  fill="url(#tool-hammer)" stroke="#333d3c" stroke-width="2.3"/>
 <path d="M177 27 Q178 24 187 24 L246 24" stroke="#e5e6db" stroke-width="2.5" stroke-opacity=".64"/>
 <path d="M175 61 Q180 67 191 67 L247 64" stroke="#1a2929" stroke-width="3" opacity=".55"/>
 <ellipse cx="177" cy="45" rx="6.2" ry="23.8" fill="#7d8b87" stroke="#b7bfba" stroke-width="1.5"/>
</g>
<g id="tool-impact" opacity="0">
 <path d="M59 278 L42 300 L50 278 L36 278 L54 268" fill="none" stroke="#e4ddc7" stroke-width="2.3" stroke-linecap="round"/>
 <path d="M63 271 L87 287 L71 276 L74 302" fill="none" stroke="#e7dcc0" stroke-width="1.6" stroke-linecap="round"/>
 <path d="M61 278 L30 287" fill="none" stroke="#b7b4a4" stroke-width="1.1"/>
 <path d="M42 271 L26 282 L36 290Z" fill="#7a8479"/>
 <path d="M78 277 L88 290 L73 294Z" fill="#8a9185"/>
 <circle cx="39" cy="295" r="2" fill="#aeafa5"/>
 <circle cx="88" cy="300" r="2.4" fill="#8f9690"/>
</g>
</svg>`;
 host.append(wrapper);
 const mallet=wrapper.querySelector('#tool-mallet');
 const chisel=wrapper.querySelector('#tool-chisel');
 const chips=wrapper.querySelector('#tool-impact');
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
 const fract=x=>x-Math.floor(x);
 function update(p,reduced=false){
  const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
  const phone=window.innerWidth<=800;
  const visible=p>=.565&&p<.765&&!reduced;
  wrapper.style.visibility=visible?'visible':'hidden';
  wrapper.setAttribute('aria-hidden',String(!visible));
  host.dataset.physicalChiselVisible=String(visible);
  if(!visible)return;
  const t=Math.max(0,Math.min(1,(p-.565)/.20));
  // 26 strikes distributed through exactly the progressive solid-carving interval.
  const phase=fract(t*26);
  const strike=smooth((phase-.45)/.10)*(1-smooth((phase-.60)/.13));
  const lift=1-strike;
  const px=phone?w*(.49+.010*Math.sin(t*15)):w*(.686+.025*Math.sin(t*17));
  const py=phone?h*(.515+.050*t):h*(.37+.19*t);
  const width=phone?Math.min(w*.60,240):Math.min(w*.29,374);
  const height=width*330/360;
  wrapper.style.width=width.toFixed(1)+'px';
  wrapper.style.height=height.toFixed(1)+'px';
  wrapper.style.left=(px-width*57/360).toFixed(1)+'px';
  wrapper.style.top=(py-height*273/330).toFixed(1)+'px';
  chisel.setAttribute('transform','rotate('+(-1.5+strike*2.4).toFixed(2)+' 59 273)');
  mallet.setAttribute('transform',
   'translate('+(-6*strike).toFixed(2)+' '+(-35*lift).toFixed(2)+') rotate('+
   (-5*lift+2*strike).toFixed(2)+' 221 62)');
  chips.setAttribute('opacity',(strike*.92).toFixed(3));
  chips.setAttribute('transform',
   'translate('+((phase-.56)*12).toFixed(2)+' '+(-5*strike).toFixed(2)+')');
  wrapper.style.opacity=(smooth((p-.565)/.013)*(1-smooth((p-.749)/.016))).toFixed(3);
  host.dataset.physicalStrikeContact=String(strike>.72);
  host.dataset.physicalStrikeProgress=t.toFixed(4);
  host.dataset.physicalTipX=(px/w).toFixed(4);
  host.dataset.physicalTipY=(py/h).toFixed(4);
 }
 return {update};
}
