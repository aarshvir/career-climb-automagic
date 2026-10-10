// Black-box checks only. This script contains no credentials or user sessions.
import assert from 'node:assert/strict';
const endpoint = 'https://gvftdfriujrkpptdueyb.supabase.co/functions/v1/';
const results = await Promise.all(['get-entitlement','tailor-cv','create-checkout'].map(async name => {
  const response = await fetch(endpoint+name,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://jobvance.io'},body:'{}'});
  const payload = await response.json();
  assert.equal(response.status,401,name+' must reject an anonymous request');
  assert.equal(payload.code,'UNAUTHORIZED',name+' must run its own verified-user check');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://jobvance.io');
  return {name,anonymousStatus:response.status,verifiedHandler:true};
}));
const rejectedOrigin = await fetch(endpoint+'get-entitlement',{method:'OPTIONS',headers:{Origin:'https://untrusted.example','Access-Control-Request-Method':'POST'}});
assert.equal(rejectedOrigin.headers.get('Access-Control-Allow-Origin'),null,'Unapproved origins must not receive browser access');
const localPreflight = await fetch(endpoint+'get-entitlement',{method:'OPTIONS',headers:{Origin:'http://localhost:8080','Access-Control-Request-Method':'POST'}});
assert.equal(localPreflight.headers.get('Access-Control-Allow-Origin'),'http://localhost:8080');
console.log(JSON.stringify({results,unapprovedOriginDenied:true,approvedLocalCallbackReady:true},null,2));
