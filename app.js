const DEFAULT_MEATS = [
  {name:'TOMAHAWK',price:7.90},{name:'FIORENTINA',price:8.50},{name:'COSTATA',price:6.90},{name:'T-BONE',price:7.50},
  {name:'CONTROFILETTO',price:8.90},{name:'FILETTO',price:9.50},{name:'PICANHA',price:6.80},{name:'ENTRECÔTE',price:7.20},
  {name:'CANGURO',price:6.50},{name:'AGNELLO',price:7.00},{name:'MAIALE',price:4.90},{name:'POLLO',price:3.50}
];
let db = null;
let table = 1;
let meats = [];
let meat = null;
let orders = [];
let selected = new Set();
let admin = false;
const $ = (id) => document.getElementById(id);
const euro = (n) => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n || 0));
const day = () => new Date().toISOString().slice(0,10);
function toast(t){ $('toast').textContent=t; $('toast').style.display='block'; setTimeout(()=>$('toast').style.display='none',2600); }
function status(t,cls){ $('status').textContent=t; $('status').className='status '+(cls||''); }
function show(v){ ['Griglia','Cassa','Admin'].forEach(x=>{ $('tab'+x).classList.toggle('active',x===v); $('view'+x).classList.toggle('active',x===v); }); }
function bind(){
  $('tabGriglia').onclick=()=>show('Griglia'); $('tabCassa').onclick=()=>show('Cassa'); $('tabAdmin').onclick=()=>show('Admin');
  $('weight').oninput=calc; $('clear').onclick=()=>{$('weight').value='';calc();}; $('send').onclick=send;
  $('merge').onclick=merge; $('clearDone').onclick=clearDone; $('login').onclick=login;
  $('addMeat').onclick=()=>{meats.push({name:'NUOVA CARNE',price:0});renderAdmin();renderMeats();};
  $('saveMeats').onclick=saveMeats; $('resetMeats').onclick=resetMeats;
}
function renderTables(){ const box=$('tables'); box.innerHTML=''; for(let i=1;i<=30;i++){ const b=document.createElement('button'); b.textContent=i; b.className=i===table?'active':''; b.onclick=()=>{table=i; $('selTable').textContent=i; renderTables();}; box.appendChild(b); } }
async function init(){
  try{
    if (typeof firebaseConfig === 'undefined') throw new Error('firebaseConfig mancante');
    firebase.initializeApp(firebaseConfig); db=firebase.firestore(); bind(); renderTables(); await ensureMeats(); listenMeats(); listenOrders(); status('ONLINE - SINCRONIZZATO','ok');
  }catch(e){ console.error(e); status('ERRORE FIREBASE','err'); toast('Errore collegamento Firebase'); }
}
async function ensureMeats(){ const ref=db.collection('settings').doc('meats'); const snap=await ref.get(); if(!snap.exists) await ref.set({list:DEFAULT_MEATS,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); }
function listenMeats(){ db.collection('settings').doc('meats').onSnapshot(s=>{ meats=s.exists?(s.data().list||DEFAULT_MEATS):DEFAULT_MEATS; if(!meat || !meats.find(m=>m.name===meat.name)) meat=meats[0]; renderMeats(); renderAdmin(); calc(); },e=>{ console.error(e); status('ERRORE DATABASE','err'); }); }
function renderMeats(){ const box=$('meats'); box.innerHTML=''; meats.forEach(m=>{ const b=document.createElement('button'); b.innerHTML=`${m.name}<small>${Number(m.price).toFixed(2).replace('.',',')} €/100G</small>`; b.className=meat && meat.name===m.name?'active':''; b.onclick=()=>{meat=m;renderMeats();calc();}; box.appendChild(b); }); }
function calc(){ const w=Number($('weight').value||0), p=Number(meat?.price||0), tot=w/100*p; $('price').textContent=euro(p); $('total').textContent=euro(tot); return {w,p,tot}; }
async function send(){ const {w,p,tot}=calc(); if(!meat) return toast('Seleziona carne'); if(!w || w<=0) return toast('Inserisci peso'); try{ await db.collection('orders').add({table,meatName:meat.name,pricePer100:p,weight:w,total:Math.round(tot*100)/100,status:'pending',day:day(),createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); $('weight').value=''; calc(); toast('Inviato alla cassa'); show('Cassa'); }catch(e){ console.error(e); toast('Errore invio: controlla Firestore'); } }
function listenOrders(){ db.collection('orders').orderBy('createdAt','desc').onSnapshot(s=>{ orders=s.docs.map(d=>({id:d.id,...d.data()})).filter(o=>o.day===day()); renderOrders(); status('ONLINE - SINCRONIZZATO','ok'); },e=>{ console.error(e); status('ERRORE DATABASE','err'); toast('Errore lettura database'); }); }
function renderOrders(){ const pending=orders.filter(o=>o.status==='pending'), done=orders.filter(o=>o.status==='done'); $('badge').textContent=pending.length; $('pendingCount').textContent=pending.length; $('doneCount').textContent=done.length; $('dayTotal').textContent=euro(orders.reduce((s,o)=>s+Number(o.total||0),0)); $('pendingList').innerHTML=pending.length?'':'<p class="muted">Nessuna carne da inserire.</p>'; pending.sort((a,b)=>a.table-b.table).forEach(o=>$('pendingList').appendChild(orderEl(o,true))); $('doneList').innerHTML=done.length?'':'<p class="muted">Nessuna carne inserita.</p>'; done.slice(0,40).forEach(o=>$('doneList').appendChild(orderEl(o,false))); }
function orderEl(o,pending){ const d=document.createElement('div'); d.className='order '+(pending?'pending':'done'); d.innerHTML=`<input class="check" type="checkbox" ${selected.has(o.id)?'checked':''} ${pending?'':'disabled'}><div><div class="orderTitle">Tav. ${o.table} - ${o.meatName}</div><div class="orderSub">${o.weight} g · ${Number(o.pricePer100).toFixed(2).replace('.',',')} €/100g</div></div><div class="orderPrice">${euro(o.total)}</div><div class="orderBtns"><button class="${pending?'doneBtn':'editBtn'}">${pending?'✓ INSERITO':'↩ RIPRISTINA'}</button><button class="deleteBtn">ELIMINA</button></div>`; d.querySelector('.check').onchange=e=>e.target.checked?selected.add(o.id):selected.delete(o.id); const bs=d.querySelectorAll('.orderBtns button'); bs[0].onclick=()=>db.collection('orders').doc(o.id).update({status:pending?'done':'pending',updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); bs[1].onclick=()=>{ if(confirm('Eliminare questa riga?')) db.collection('orders').doc(o.id).delete(); }; return d; }
async function merge(){ const arr=orders.filter(o=>selected.has(o.id)&&o.status==='pending'); if(arr.length<2) return toast('Seleziona almeno 2 righe'); const f=arr[0]; if(!arr.every(o=>o.table===f.table&&o.meatName===f.meatName&&Number(o.pricePer100)===Number(f.pricePer100))) return toast('Unisci solo stesso tavolo, carne e prezzo'); const weight=arr.reduce((s,o)=>s+Number(o.weight||0),0), total=arr.reduce((s,o)=>s+Number(o.total||0),0); const batch=db.batch(); arr.forEach(o=>batch.delete(db.collection('orders').doc(o.id))); batch.set(db.collection('orders').doc(),{table:f.table,meatName:f.meatName+' ×'+arr.length,pricePer100:f.pricePer100,weight,total:Math.round(total*100)/100,status:'pending',day:day(),createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),merged:true}); await batch.commit(); selected.clear(); toast('Righe unite'); }
async function clearDone(){ const done=orders.filter(o=>o.status==='done'); if(!done.length) return; if(!confirm('Eliminare gli inseriti di oggi?')) return; const batch=db.batch(); done.forEach(o=>batch.delete(db.collection('orders').doc(o.id))); await batch.commit(); toast('Inseriti puliti'); }
function login(){ if($('pin').value==='1234'){ admin=true; $('pinBox').classList.add('hidden'); $('adminPanel').classList.remove('hidden'); renderAdmin(); } else toast('PIN non corretto'); }
function renderAdmin(){ if(!admin) return; const box=$('adminRows'); box.innerHTML=''; meats.forEach((m,i)=>{ const r=document.createElement('div'); r.className='adminRow'; r.innerHTML=`<input data-i="${i}" data-k="name" value="${m.name||''}"><input data-i="${i}" data-k="price" type="number" step="0.01" value="${m.price||0}"><button>×</button>`; r.querySelector('button').onclick=()=>{meats.splice(i,1);renderAdmin();renderMeats();}; box.appendChild(r); }); }
async function saveMeats(){ document.querySelectorAll('#adminRows input').forEach(inp=>{ const i=Number(inp.dataset.i), k=inp.dataset.k; meats[i][k]=k==='price'?Number(inp.value):inp.value.toUpperCase(); }); meats=meats.filter(m=>m.name&&Number(m.price)>=0); await db.collection('settings').doc('meats').set({list:meats,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); toast('Carni salvate'); }
async function resetMeats(){ if(confirm('Ripristinare carni base?')) await db.collection('settings').doc('meats').set({list:DEFAULT_MEATS,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); }
init();
