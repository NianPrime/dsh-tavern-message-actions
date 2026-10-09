import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {createLayeredSeams} from './bridge/layered-seams.mjs'
export const inject=['loader']
export async function apply(ctx,config){
  const require=createRequire(import.meta.url);
  try {require.resolve('dsh-tavern-sqlite-v2/package.json');}catch(error){if(error.code==='MODULE_NOT_FOUND')return;throw error;}
  const {createStandardHostApply}=await import('dsh-tavern-sqlite-v2/standard-host');
  const entry=require.resolve('dsh-tavern-sqlite-v2/package.json');
  const upstream=await import(new URL('./deploy/standard-seams.mjs',pathToFileURL(entry)).href);
  return await createStandardHostApply({loadSeams:async()=>createLayeredSeams(upstream)})(ctx,config);
}
