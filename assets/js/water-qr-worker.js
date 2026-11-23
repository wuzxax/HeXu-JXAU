/* Local-only QR decoding. Keep camera frames and album images off the network. */
'use strict';
let engine;
async function prepare(){
 if(!engine)engine=(async()=>{
  try{
   importScripts('vendor/zxing-reader.js');
   await ZXingWASM.prepareZXingModule({overrides:{locateFile:()=>new URL('vendor/zxing_reader.wasm',self.location.href).href},fireImmediately:true});
   return 'zxing';
  }catch(e){importScripts('vendor/jsQR.js');return 'jsqr';}
 })();
 return engine;
}
self.onmessage=async e=>{
 const {id,buffer,width,height,harder}=e.data;
 try{
  const type=await prepare();
  if(!buffer){self.postMessage({id,ready:true,engine:type});return;}
  const pixels=new Uint8ClampedArray(buffer);let text='';
  if(type==='zxing'){
   const results=await ZXingWASM.readBarcodes(new ImageData(pixels,width,height),{formats:['QRCode'],tryHarder:!!harder,tryRotate:true,tryInvert:true,maxNumberOfSymbols:1});
   text=results[0]?.text||'';
  }else text=self.jsQR(pixels,width,height,{inversionAttempts:harder?'attemptBoth':'dontInvert'})?.data||'';
  self.postMessage({id,text,engine:type});
 }catch(e){self.postMessage({id,error:'二维码识别暂不可用，请重新打开扫码'});}
};
