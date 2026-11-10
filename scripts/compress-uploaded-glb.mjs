// Authoring only. Install pinned tools outside the app checkout:
// npm install --prefix /workspace/glb-tools @gltf-transform/core@4.5.1
//   @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 meshoptimizer@1.3.0
// node scripts/compress-uploaded-glb.mjs SOURCE DESTINATION /workspace/glb-tools
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const [source,destination,toolchain='/workspace/glb-tools']=process.argv.slice(2);
if(!source||!destination)throw new Error('Provide source and destination GLB paths');
const require=createRequire(resolve(toolchain,'package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {meshopt}=require('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=require('meshoptimizer');
await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const document=await io.read(source);
// Keep all triangles. Quantization bounds coordinate precision to 16 bits;
// normals use 12 bits and UVs 14 bits. No simplification or reconstruction.
await document.transform(meshopt({encoder:MeshoptEncoder,level:'medium',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
await io.write(destination,document);
