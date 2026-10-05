import * as THREE from '../public/vendor/three.module.min.js';

// These are approximate geometric studies of the current reference photos.
// Replace the GLB assets with scans of the actual works for final presentation.
const definitions = {
  'folded-light': {title:'Folded Light',source:'/assets/fold.jpg',color:'#d8c7a3',roughness:.52},
  continuum: {title:'Continuum',source:'/assets/hero.jpg',color:'#33362c',roughness:.3},
  together: {title:'Together',source:'/assets/together.jpg',color:'#526044',roughness:.32},
  'quiet-flight': {title:'Quiet Flight',source:'/assets/bird.jpg',color:'#aa7339',roughness:.35},
  equilibrium: {title:'Equilibrium',source:'/assets/balance.jpg',color:'#393a35',roughness:.7}
};
export {definitions};
function extrude(shape, depth=.38, bevel=.08) {
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:5,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:36});
  geometry.translate(0,0,-depth/2); return geometry;
}
function ribbon() {
  const points=[],indices=[],rings=100,sides=32;
  for(let row=0;row<=rings;row++) {
    const t=row/rings,angle=t*Math.PI*1.85-.5,width=.57-.13*t+.06*Math.sin(t*Math.PI),depth=.105+.04*(1-t);
    for(let side=0;side<=sides;side++) {
      const theta=side/sides*Math.PI*2,x=width*Math.cos(theta),z=depth*Math.sin(theta);
      points.push(x*Math.cos(angle)-z*Math.sin(angle)+.07*Math.sin(t*Math.PI*2),t*3-1.5,x*Math.sin(angle)+z*Math.cos(angle));
    }
  }
  for(let row=0;row<rings;row++)for(let side=0;side<sides;side++) {
    const a=row*(sides+1)+side,b=a+sides+1; indices.push(a,b,a+1,b,b+1,a+1);
  }
  // Close both ends so rotations reveal a solid volume, rather than a plane.
  for(const row of [0,rings]) {
    const center=points.length/3;points.push(.07*Math.sin(row/rings*Math.PI*2),row/rings*3-1.5,0);
    for(let side=0;side<sides;side++){const a=row*(sides+1)+side;indices.push(...(row===0?[center,a,a+1]:[center,a+1,a]));}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function openForm() {
  const s=new THREE.Shape();s.moveTo(-.38,-1.45);
  s.bezierCurveTo(-1,-.55,-.47,.52,.35,1.6);s.bezierCurveTo(.12,.82,.55,.15,.73,-.7);s.bezierCurveTo(.86,-1.18,.58,-1.45,-.38,-1.45);
  const hole=new THREE.Path();hole.moveTo(-.1,-.8);hole.bezierCurveTo(-.45,-.45,-.31,.23,.02,.55);hole.bezierCurveTo(.31,.34,.48,-.43,.12,-.8);hole.closePath();s.holes.push(hole);
  const geometry=extrude(s,.38,.09),position=geometry.attributes.position;
  for(let i=0;i<position.count;i++){const y=position.getY(i),x=position.getX(i),z=position.getZ(i),angle=y*.19;position.setXYZ(i,x*Math.cos(angle)-z*Math.sin(angle),y,x*Math.sin(angle)+z*Math.cos(angle));}
  geometry.computeVertexNormals();return geometry;
}
function figures(group,material) {
  const s=new THREE.Shape();s.moveTo(-.73,-1.5);s.bezierCurveTo(-.8,-.38,-.67,.72,-.26,.72);s.bezierCurveTo(.05,.75,.18,.38,.44,.8);s.bezierCurveTo(.84,.82,.86,-.68,.73,-1.5);s.closePath();
  const heart=new THREE.Path();heart.moveTo(-.06,-.46);heart.bezierCurveTo(-.42,.03,-.38,.4,-.09,.36);heart.quadraticCurveTo(.08,.2,.22,.41);heart.bezierCurveTo(.49,.39,.37,-.14,-.06,-.46);s.holes.push(heart);
  const lower=new THREE.Path();lower.moveTo(-.36,-1.19);lower.quadraticCurveTo(-.25,-.7,-.07,-.65);lower.quadraticCurveTo(.33,-.83,.41,-1.19);lower.closePath();s.holes.push(lower);
  group.add(new THREE.Mesh(extrude(s,.4,.08),material));
  for(const [x,y,rotation] of [[-.27,1.05,.2],[.32,1.35,-.2]]) {
    const head=new THREE.Mesh(new THREE.SphereGeometry(1,40,28),material);head.scale.set(.235,.31,.205);head.position.set(x,y,0);head.rotation.z=rotation;group.add(head);
    const neck=new THREE.Mesh(new THREE.SphereGeometry(1,24,18),material);neck.scale.set(.115,.22,.13);neck.position.set(x,y-.29,0);group.add(neck);
  }
}
function bird() {
  const s=new THREE.Shape();s.moveTo(-.6,-1.45);s.bezierCurveTo(-.59,-.65,-.3,-.08,.05,.28);s.bezierCurveTo(.33,.59,.24,1.21,-.16,1.4);s.quadraticCurveTo(-.35,1.5,-.63,1.46);s.quadraticCurveTo(-.08,1.41,.04,1.1);s.bezierCurveTo(.49,.25,.75,-.86,.54,-1.45);s.closePath();return extrude(s,.39,.075);
}
function balance(group,material) {
  const shapes=[[[ -.7,-1.5],[.67,-1.5],[.54,-.66],[-.53,-.57]],[[ -.59,-.5],[.64,-.5],[.63,.38],[-.6,.45]],[[ -.78,.56],[.59,.48],[.64,1.29],[-.68,1.47]]];
  shapes.forEach((points,index)=>{const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();if(index===1){const hole=new THREE.Path();hole.absellipse(.02,-.01,.32,.32,0,Math.PI*2,true);shape.holes.push(hole);}group.add(new THREE.Mesh(extrude(shape,.55,.025),material));});
}
export function createSculpture(id) {
  const definition=definitions[id];if(!definition)throw new Error('Unknown sculpture');
  const material=new THREE.MeshStandardMaterial({color:definition.color,roughness:definition.roughness,metalness:.025});
  const group=new THREE.Group();group.name=definition.title;
  if(id==='folded-light')group.add(new THREE.Mesh(ribbon(),material));
  if(id==='continuum')group.add(new THREE.Mesh(openForm(),material));
  if(id==='together')figures(group,material);
  if(id==='quiet-flight')group.add(new THREE.Mesh(bird(),material));
  if(id==='equilibrium')balance(group,material);
  group.updateMatrixWorld(true);return group;
}
