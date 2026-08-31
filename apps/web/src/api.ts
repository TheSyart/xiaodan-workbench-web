import type { ApiResult } from '@xiaodan/contracts';

export const basePath=(import.meta.env.BASE_URL||'/xiaodan/').replace(/\/$/,'');
export const apiRoot=`${basePath}/api/v1`;

export class ApiClientError extends Error {
  constructor(public code:string,message:string,public status:number,public details?:unknown){super(message);}
}

export async function api<T>(path:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(`${apiRoot}${path}`,{...init,headers:{accept:'application/json',...(init.body instanceof FormData?{}:{'content-type':'application/json'}),...init.headers}});
  const body=await response.json() as ApiResult<T>;
  if(!response.ok||'error'in body){const error='error'in body?body.error:{code:'HTTP_ERROR',message:`请求失败 ${response.status}`};throw new ApiClientError(error.code,error.message,response.status,error.details);}
  return body.data;
}
export const mutationHeaders=(version?:number)=>({'Idempotency-Key':crypto.randomUUID(),...(version===undefined?{}:{'If-Match':`"${version}"`})});
export const post=<T>(path:string,body:unknown,version?:number)=>api<T>(path,{method:'POST',headers:mutationHeaders(version),body:JSON.stringify(body)});
export const put=<T>(path:string,body:unknown,version?:number)=>api<T>(path,{method:'PUT',headers:mutationHeaders(version),body:JSON.stringify(body)});
export const patch=<T>(path:string,body:unknown,version:number)=>api<T>(path,{method:'PATCH',headers:mutationHeaders(version),body:JSON.stringify(body)});

