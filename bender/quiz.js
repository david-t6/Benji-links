(function(){
var C=window.BQ_CONFIG,Q=window.BQ_QUESTIONS,EL=window.BQ_ELEMENTS,IC=window.BQ_ICONS,ORD=window.BQ_ORDER;
function $(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
$("emblems").innerHTML=ORD.map(function(k){return '<div class="emb '+EL[k].cls+'" title="'+EL[k].name+'">'+IC[k]+'</div>';}).join("");
var name="",picks=[],i=0,orders=Q.map(function(){var o=ORD.slice();for(var j=o.length-1;j>0;j--){var r=Math.floor(Math.random()*(j+1));var t=o[j];o[j]=o[r];o[r]=t;}return o;});
var nameIn=$("name");
function cleanName(v){return v.replace(/[^\p{L}\p{M}' .-]/gu,"").replace(/\s+/g," ").trim().slice(0,24);}
nameIn.addEventListener("input",function(){$("go").disabled=cleanName(nameIn.value).length<1;});
nameIn.addEventListener("keydown",function(e){if(e.key==="Enter"&&!$("go").disabled)$("go").click();});
$("go").onclick=function(){name=cleanName(nameIn.value);$("start").classList.add("hide");$("quiz").classList.remove("hide");show();};
$("back").onclick=function(){if(i>0){i--;show();}else{$("quiz").classList.add("hide");$("start").classList.remove("hide");}};
function show(){
 var q=Q[i];$("bar").style.width=(i/Q.length*100)+"%";$("qnum").textContent="Question "+(i+1)+" of "+Q.length;$("qtext").textContent=q.q;
 $("opts").innerHTML=orders[i].map(function(k){return '<button class="opt'+(picks[i]===k?" sel":"")+'" data-k="'+k+'">'+esc(q.a[k])+'</button>';}).join("");
 Array.prototype.forEach.call($("opts").querySelectorAll(".opt"),function(b){b.onclick=function(){picks[i]=b.getAttribute("data-k");b.classList.add("sel");setTimeout(function(){i++;if(i<Q.length)show();else finish();window.scrollTo(0,0);},180);};});
}
function b64(buf){var s="",a=new Uint8Array(buf);for(var j=0;j<a.length;j++)s+=String.fromCharCode(a[j]);return btoa(s);}
function unb64(s){var b=atob(s),a=new Uint8Array(b.length);for(var j=0;j<b.length;j++)a[j]=b.charCodeAt(j);return a;}
async function encrypt(obj){
 var sub=crypto.subtle,alg={name:"ECDH",namedCurve:"P-256"};
 var pub=await sub.importKey("raw",unb64(C.pub),alg,false,[]);
 var eph=await sub.generateKey(alg,true,["deriveKey"]);
 var key=await sub.deriveKey({name:"ECDH",public:pub},eph.privateKey,{name:"AES-GCM",length:256},false,["encrypt"]);
 var iv=crypto.getRandomValues(new Uint8Array(12));
 var ct=await sub.encrypt({name:"AES-GCM",iv:iv},key,new TextEncoder().encode(JSON.stringify(obj)));
 return {v:1,e:b64(await sub.exportKey("raw",eph.publicKey)),iv:b64(iv),ct:b64(ct)};
}
var saved=false;
async function save(rec,tries){
 var body=JSON.stringify(await encrypt(rec));
 for(var t=0;t<(tries||4);t++){
  try{var r=await fetch("https://ntfy.sh/"+C.topic,{method:"POST",body:body});if(r.ok)return true;}catch(e){}
  await new Promise(function(res){setTimeout(res,1500*(t+1));});
 }
 return false;
}
function finish(){
 $("quiz").classList.add("hide");
 var r=window.BQ_SCORE(picks),E=EL[r.element],tot=Q.length;
 var rec={id:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random()),name:name,result:r.element,side:r.side,tie:r.tie,scores:r.scores,answers:picks,at:new Date().toISOString(),ver:1};
 var bars=ORD.map(function(k){return '<div class="bar"><span class="n">'+EL[k].name+'</span><span class="t"><div style="width:'+(r.scores[k]/tot*100)+'%;background:'+EL[k].color+'"></div></span><span class="v">'+r.scores[k]+'</span></div>';}).join("");
 var side=r.side?'<p style="text-align:center;color:var(--muted);margin-top:-6px">with a little '+EL[r.side].name+' on the side</p>':"";
 $("result").innerHTML='<div class="big-emb '+E.cls+'">'+IC[r.element]+'</div><div class="qnum">'+esc(name)+', you are a</div><h2>'+E.name+' Bender</h2><p class="tag" style="color:'+E.color+'">'+E.tag+'</p>'+side+'<p>'+E.desc+'</p><p class="verse">'+E.verse+'</p><div class="bars">'+bars+'</div><div class="hint" id="status" style="text-align:center">Saving your result…</div><button class="btn hide" id="retry">Try saving again</button><button class="btn ghost" id="again">Take it again</button>';
 $("result").classList.remove("hide");window.scrollTo(0,0);
 $("again").onclick=function(){location.reload();};
 function attempt(){$("status").textContent="Saving your result…";$("retry").classList.add("hide");save(rec).then(function(ok){if(ok){saved=true;$("status").textContent="✓ Saved! Screenshot this and drop it in the group chat.";}else{$("status").textContent="Couldn't save. Check your connection and tap below.";$("retry").classList.remove("hide");}});}
 $("retry").onclick=attempt;attempt();
}
})();
