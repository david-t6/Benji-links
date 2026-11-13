(function(){
var C=window.BQ_CONFIG,Q=window.BQ_QUESTIONS,EL=window.BQ_ELEMENTS,ORD=window.BQ_ORDER,sub=crypto.subtle;
var ARCHIVE="https://raw.githubusercontent.com/david-t6/Benji-links/main/bender/data/submissions.json";
var LS="bq_results_pw";
function $(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function unb64(s){var b=atob(s),a=new Uint8Array(b.length);for(var j=0;j<b.length;j++)a[j]=b.charCodeAt(j);return a;}
var priv=null,all=[];
async function unlock(pw){
 var base=await sub.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveKey"]);
 var k=await sub.deriveKey({name:"PBKDF2",salt:unb64(C.kdf.salt),iterations:C.kdf.iter,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["decrypt"]);
 var pk8=await sub.decrypt({name:"AES-GCM",iv:unb64(C.encPriv.iv)},k,unb64(C.encPriv.ct));
 return sub.importKey("pkcs8",pk8,{name:"ECDH",namedCurve:"P-256"},false,["deriveKey"]);
}
async function dec(msg){
 var m=JSON.parse(msg);
 var pub=await sub.importKey("raw",unb64(m.e),{name:"ECDH",namedCurve:"P-256"},false,[]);
 var key=await sub.deriveKey({name:"ECDH",public:pub},priv,{name:"AES-GCM",length:256},false,["decrypt"]);
 var pt=await sub.decrypt({name:"AES-GCM",iv:unb64(m.iv)},key,unb64(m.ct));
 return JSON.parse(new TextDecoder().decode(pt));
}
async function load(){
 $("note").textContent="Loading…";
 var msgs={},problems=[];
 try{var a=await (await fetch(ARCHIVE+"?t="+Date.now(),{cache:"no-store"})).json();(a.items||[]).forEach(function(it){msgs[it.id]=it;});}catch(e){problems.push("archive");}
 try{var t=await (await fetch("https://ntfy.sh/"+C.topic+"/json?poll=1&since=all",{cache:"no-store"})).text();
  t.split("\n").forEach(function(l){if(!l.trim())return;try{var m=JSON.parse(l);if(m.event==="message")msgs[m.id]={id:m.id,time:m.time,message:m.message};}catch(e){}});}catch(e){problems.push("live feed");}
 var out=[],seen={};
 for(var id in msgs){var it=msgs[id];if(it.time<(C.startAfter||0))continue;try{var r=await dec(it.message);if(seen[r.id]||(C.ignoreIds||[]).indexOf(r.id)>=0)continue;seen[r.id]=1;if(!EL[r.result])continue;r._t=it.time;out.push(r);}catch(e){}}
 out.sort(function(x,y){return y._t-x._t;});all=out;render();
 $("note").textContent="Updated "+new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})+(problems.length?" · couldn't reach the "+problems.join(" or "):"");
}
function shown(){
 if(!$("latest").checked)return all;
 var by={};return all.filter(function(r){var k=r.name.toLowerCase();if(by[k])return false;by[k]=1;return true;});
}
function render(){
 var rows=shown(),c={W:0,E:0,F:0,A:0};rows.forEach(function(r){c[r.result]++;});
 $("counts").innerHTML=ORD.map(function(k){return '<div class="count '+EL[k].cls+'"><b>'+c[k]+'</b>'+EL[k].name+'</div>';}).join("");
 $("summary").textContent=rows.length+" "+(rows.length===1?"person":"people")+(all.length!==rows.length?" ("+all.length+" submissions)":"");
 $("rows").innerHTML=rows.map(function(r){
  var d=new Date(r._t*1000).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  var ans=(r.answers||[]).map(function(k,i){return '<li>'+esc(Q[i]?Q[i].a[k]||k:k)+' <b>('+(EL[k]?EL[k].name:k)+')</b></li>';}).join("");
  return '<tr><td><b>'+esc(r.name)+'</b><details><summary>answers</summary><ol>'+ans+'</ol></details></td><td><span class="pill" style="background:'+EL[r.result].color+'">'+EL[r.result].name+'</span>'+(r.side?'<div class="hint">+ '+EL[r.side].name+'</div>':'')+'</td><td class="hint">'+d+'</td></tr>';
 }).join("");
}
function csv(){
 var rows=shown(),h=["name","element","side","water","earth","fire","air","submitted"].concat(Q.map(function(_,i){return "q"+(i+1);}));
 var lines=[h.join(",")].concat(rows.map(function(r){return [r.name,EL[r.result].name,r.side?EL[r.side].name:"",r.scores.W,r.scores.E,r.scores.F,r.scores.A,new Date(r._t*1000).toISOString()].concat((r.answers||[]).map(function(k){return EL[k]?EL[k].name:k;})).map(function(v){v=String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(",");}));
 var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/csv"}));a.download="bender-quiz-results.csv";a.click();
}
async function tryPw(pw,quiet){
 try{priv=await unlock(pw);}catch(e){if(!quiet)$("pwerr").classList.remove("hide");return false;}
 try{localStorage.setItem(LS,pw);}catch(e){}
 $("lock").classList.add("hide");$("view").classList.remove("hide");load();return true;
}
$("unlock").onclick=function(){$("pwerr").classList.add("hide");tryPw($("pw").value.trim());};
$("pw").addEventListener("keydown",function(e){if(e.key==="Enter")$("unlock").click();});
$("refresh").onclick=load;$("csv").onclick=csv;$("latest").onchange=render;
$("forget").onclick=function(){try{localStorage.removeItem(LS);}catch(e){}location.reload();};
var saved=null;try{saved=localStorage.getItem(LS);}catch(e){}
if(saved)tryPw(saved,true);
})();
