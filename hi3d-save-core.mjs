/** Versioned JSON saves, with caller-owned storage and migration functions. */
function jsonData(data){const seen=new Set();function check(v){if(v===null||typeof v==='string'||typeof v==='boolean')return;if(typeof v==='number'&&Number.isFinite(v))return;if(typeof v!=='object'||seen.has(v))throw new TypeError('save requires finite acyclic JSON');if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype)throw new TypeError('save requires plain objects');seen.add(v);for(const x of Object.values(v))check(x);seen.delete(v);}check(data);return JSON.parse(JSON.stringify(data));}
export function encode(game,version,data){if(typeof game!=='string'||!game||!Number.isSafeInteger(version)||version<1)throw new Error('invalid save identity');return JSON.stringify({schema:'game-save.v1',game,version,data:jsonData(data)});}
export function decode(text,{game,version,migrations={},validate=()=>true,maxBytes=1048576}){
 if(typeof game!=='string'||!game||!Number.isSafeInteger(version)||version<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('invalid target save configuration');
 if(typeof text!=='string'||new TextEncoder().encode(text).length>maxBytes)throw new Error('save too large or invalid');
 const value=JSON.parse(text);if(value?.schema!=='game-save.v1'||value.game!==game||!Number.isSafeInteger(value.version)||value.version<1||value.version>version||version-value.version>100)throw new Error('incompatible save');
 let data=jsonData(value.data);for(let v=value.version;v<version;v++){if(typeof migrations[v]!=='function')throw new Error(`missing migration ${v}`);data=jsonData(migrations[v](data));}
 if(validate(data)!==true)throw new Error('invalid save payload');return data;
}
export function writeSave(storage,key,text){storage.setItem(key,text);if(storage.getItem(key)!==text)throw new Error('save readback failed');}
