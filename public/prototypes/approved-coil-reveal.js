// Render the exact approved Coil GLB for the final reveal only.
// Keep every original mesh, material, vertex colour, and texture unchanged.
// This is deliberately isolated from the offline volumetric carving frames.
export function createApprovedCoilReveal(host, onState=()=>{}) {
  const layer=document.createElement('div');
  layer.className='approved-coil-reveal';
  layer.setAttribute('aria-hidden','true');
  host.append(layer);

  const mobile=()=>window.innerWidth<=800;
  const state={started:false,ready:false,error:false,scene:null,renderer:null,camera:null,
    model:null,root:null,canvas:null,plinth:null,lastWidth:0,lastHeight:0,lastRatio:0};
  const emit=(value)=>{host.dataset.approvedModelState=value;onState(value)};

  async function initialize(){
    if(state.started)return;
    state.started=true;emit('loading');
    let THREE,GLTFLoader,MeshoptDecoder;
    try {
      [{default:THREE}, {GLTFLoader}, {MeshoptDecoder}]=await Promise.all([
        // Importing a namespace has no default export: the wrapper below fills it.
        import('/vendor/three.module.min.js').then(m=>({default:m})),
        import('/vendor/GLTFLoader.js'),
        import('/vendor/meshopt_decoder.js')
      ]);
      const canvas=document.createElement('canvas');
      canvas.setAttribute('aria-label','The approved three-dimensional Coil model by Douglas Musekiwa');
      canvas.className='approved-coil-canvas';
      state.canvas=canvas;layer.append(canvas);
      const context=canvas.getContext('webgl2',{antialias:!mobile(),alpha:false,powerPreference:'low-power'});
      if(!context)throw Error('WebGL2 unavailable for approved Coil presentation');
      const renderer=new THREE.WebGLRenderer({canvas,context,alpha:false,antialias:!mobile(),powerPreference:'low-power'});
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.07;
      state.renderer=renderer;
      const scene=new THREE.Scene();
      scene.background=new THREE.Color(0x161d19);
      scene.add(new THREE.HemisphereLight(0xe6e8dd,0x33362e,2.6));
      for(const [color,intensity,x,y,z] of [
        [0xf6e6cf,3.2,-4,7,6],[0xdde6f0,1.5,4,5,2],[0xf6f1e7,2,1,6]
      ]){
        const light=new THREE.DirectionalLight(color,intensity);
        light.position.set(x,y,z);scene.add(light);
      }
      const camera=new THREE.PerspectiveCamera(34,1,.1,100);
      state.scene=scene;state.camera=camera;
      const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const gltf=await loader.loadAsync('/models/coil-uploaded-v1.glb');
      const original=gltf.scene;
      const bounds=new THREE.Box3().setFromObject(original);
      const dimensions=bounds.getSize(new THREE.Vector3());
      const center=bounds.getCenter(new THREE.Vector3());
      if(!Number.isFinite(dimensions.y)||dimensions.y<=0)throw Error('Invalid approved Coil GLB');
      const factor=3.05/Math.max(dimensions.y,dimensions.x*.95,dimensions.z*.95);
      original.scale.multiplyScalar(factor);
      original.position.set(-center.x*factor,-bounds.min.y*factor,-center.z*factor);
      original.updateMatrixWorld(true);
      const root=new THREE.Group();root.add(original);scene.add(root);
      state.root=root;state.model=original;
      // The slab is sized to the footprint of Coil, not to a generic sculpture.
      const width=Math.max(dimensions.x*factor*1.10,1.55);
      const depth=Math.max(dimensions.z*factor*2.2,.90);
      const shape=new THREE.Shape(),w=width/2,d=depth/2,r=.035;
      shape.moveTo(-w+r,-d);shape.lineTo(w-r,-d);
      shape.quadraticCurveTo(w,-d,w,-d+r);shape.lineTo(w,d-r);
      shape.quadraticCurveTo(w,d,w-r,d);shape.lineTo(-w+r,d);
      shape.quadraticCurveTo(-w,d,-w,d-r);shape.lineTo(-w,-d+r);
      shape.quadraticCurveTo(-w,-d,-w+r,-d);
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:.20,steps:1,bevelEnabled:true,bevelThickness:.009,bevelSize:.009,bevelSegments:2});
      geometry.rotateX(-Math.PI/2);geometry.translate(0,-.20,0);
      const slab=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x8d897c,roughness:.89,metalness:0}));
      root.add(slab);state.plinth=slab;
      // A subtle grounded contact shadow, rendered independently of the stone.
      const shadowCanvas=document.createElement('canvas');
      shadowCanvas.width=shadowCanvas.height=128;
      const ctx=shadowCanvas.getContext('2d'),g=ctx.createRadialGradient(64,64,5,64,64,64);
      g.addColorStop(0,'rgba(0,0,0,.37)');g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
      const shadow=new THREE.Mesh(new THREE.PlaneGeometry(width*1.4,depth*1.8),
        new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
      shadow.rotation.x=-Math.PI/2;shadow.position.y=-.215;root.add(shadow);
      let meshes=0,materials=0;
      original.traverse(node=>{if(node.isMesh){meshes++;materials+=Array.isArray(node.material)?node.material.length:1;}});
      if(meshes<1||materials<1)throw Error('Approved GLB contains no renderable materials');
      host.dataset.approvedModelUrl='/models/coil-uploaded-v1.glb';
      host.dataset.approvedMeshCount=String(meshes);
      host.dataset.approvedMaterialsPreserved='true';
      canvas.addEventListener('webglcontextlost',e=>{
        e.preventDefault();state.ready=false;emit('context-lost');
      });
      state.ready=true;emit('ready');
      resize();render();
    } catch(error) {
      state.error=true;emit('error');
      console.warn('The approved Coil GLB could not be displayed',error);
      // The actual studio photograph is a truthful fallback; never substitute
      // the generic offline-rendered approximation for the approved finish.
      layer.classList.add('approved-photo-fallback');
      const img=document.createElement('img');
      img.src='/assets/zsa-006-studio-front-v2.webp';
      img.alt='Photograph of the original Coil sculpture';
      layer.append(img);
    }
  }
  function resize(){
    if(!state.ready||!state.renderer)return;
    const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
    const ratio=Math.min(window.devicePixelRatio||1,mobile()?1.15:1.5);
    if(w!==state.lastWidth||h!==state.lastHeight||ratio!==state.lastRatio){
      state.renderer.setPixelRatio(ratio);
      state.renderer.setSize(w,h,false);
      state.lastWidth=w;state.lastHeight=h;state.lastRatio=ratio;
    }
    state.camera.aspect=w/h;
    state.camera.fov=mobile()?36:33;
    state.camera.updateProjectionMatrix();
  }
  function render(){
    if(!state.ready)return;
    resize();
    const phone=mobile();
    state.root.rotation.set(0,.14,0);
    state.camera.position.set(phone?.10:1.38,3.12,phone?9.55:8.55);
    state.camera.lookAt(phone?0:.28,phone?1.33:1.68,0);
    state.renderer.render(state.scene,state.camera);
  }
  function update(p){
    // Prewarm the 3D asset before its reveal; zero per-scroll GPU work
    // throughout Zimbabwe, transport, marking, chiseling and heating.
    if(p>=.875&&!state.started)initialize();
    const level=state.ready||state.error?Math.min(1,Math.max(0,(p-.954)/.026)):0;
    const opacity=level*level*(3-2*level);
    layer.style.opacity=opacity.toFixed(4);
    layer.style.visibility=opacity<=.0005?'hidden':'visible';
    layer.setAttribute('aria-hidden',String(opacity<=.0005));
    host.dataset.approvedModelVisible=String(opacity>.98);
    if(state.ready&&opacity>.0005)render();
  }
  function dispose(){
    state.renderer?.dispose();
    state.renderer?.forceContextLoss();
    layer.remove();
  }
  return {update,resize,dispose,get ready(){return state.ready;}};
}
