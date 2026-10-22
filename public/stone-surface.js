// Shared by the viewer and offline turntable review. The master photo remains
// the front colour map; source-stone sampling covers the unpictured surfaces.
// Reflections use smooth mesh normals, never the photographed mineral pattern.
export const stoneSurfaceGLSL=String.raw`
vec2 stoneTurn(vec2 f,vec2 cell){
  float t=floor(fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453)*4.);
  if(t<1.)return f;if(t<2.)return vec2(1.-f.y,f.x);
  if(t<3.)return 1.-f;return vec2(f.y,1.-f.x);
}
vec3 stoneSample(vec2 p){
  vec2 f=fract(p),g=fract(p+.5),edge=min(f,1.-f);
  float weight=smoothstep(0.,.15,min(edge.x,edge.y));
  vec3 a=texture2D(map,stoneSwatch.xy+stoneTurn(f,floor(p))*stoneSwatch.zw).rgb;
  vec3 b=texture2D(map,stoneSwatch.xy+stoneTurn(g,floor(p+.5))*stoneSwatch.zw).rgb;
  return mix(b,a,weight);
}
float stoneSoftbox(vec3 r,vec3 direction,float width,float height){
  vec3 axis=normalize(direction);
  vec3 right=normalize(cross(vec3(0.,1.,0.),axis)),up=cross(axis,right);
  float along=dot(r,axis);
  vec2 q=vec2(dot(r,right)/width,dot(r,up)/height);
  return exp(-dot(q,q)*2.5)*smoothstep(.15,.65,along);
}
vec3 polishedStone(vec3 photographed,vec3 position,vec3 sourceNormal,vec3 viewNormal,vec3 viewPosition,float polish){
  vec3 sn=normalize(sourceNormal),n=normalize(viewNormal),v=normalize(-viewPosition);
  vec3 weights=pow(abs(sn),vec3(4.));weights/=max(dot(weights,vec3(1.)),.001);
  // A larger mineral scale avoids the noisy, repeated appearance of the backs.
  vec3 stone=stoneSample(position.yz*.52+vec2(.17,.31))*weights.x
    +stoneSample(position.xz*.52+vec2(.37,.11))*weights.y
    +stoneSample(position.xy*.52+vec2(.23,.47))*weights.z;
  float front=smoothstep(.08,.62,sn.z);
  vec3 base=mix(stone,photographed,front);
  float light=.76+.24*max(dot(n,normalize(vec3(-.35,.55,1.))),0.);
  base*=mix(light,.92+.08*max(dot(n,normalize(vec3(-.35,.55,1.))),0.),front);
  vec3 reflection=reflect(-v,n);
  float fresnel=.045+.22*pow(1.-max(dot(n,v),0.),5.);
  // Tall, softly edged studio reflections articulate the curved stone as it
  // rotates. The same restrained finish is applied to front, back and sides.
  vec3 reflected=vec3(1.,.96,.88)*stoneSoftbox(reflection,vec3(-.62,.36,.72),.32,.85)
    +vec3(.90,.94,1.)*.72*stoneSoftbox(reflection,vec3(.72,.24,.64),.25,.72)
    +vec3(1.,.98,.92)*.42*stoneSoftbox(reflection,vec3(.05,.80,.48),.75,.24);
  return base+reflected*(.045+fresnel*3.)*polish;
}
vec3 reconstructionStone(vec3 base,vec3 position,vec3 sourceNormal,vec3 viewNormal,vec3 viewPosition,float polish){
  vec3 n=normalize(viewNormal),v=normalize(-viewPosition),r=reflect(-v,n);
  float d=max(dot(n,normalize(vec3(-.35,.55,1.))),0.);
  float front=smoothstep(.08,.62,normalize(sourceNormal).z);
  float light=mix(.70+.30*d,.92+.08*d,front);
  float fresnel=.045+.20*pow(1.-max(dot(n,v),0.),5.);
  vec3 reflected=vec3(1.,.96,.88)*stoneSoftbox(r,vec3(-.62,.36,.72),.32,.85)
    +vec3(.90,.94,1.)*.72*stoneSoftbox(r,vec3(.72,.24,.64),.25,.72)
    +vec3(1.,.98,.92)*.42*stoneSoftbox(r,vec3(.05,.80,.48),.75,.24);
  return base*light+reflected*(.025+fresnel*1.7)*polish;
}
`;
