import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

const DEFAULT_MEATS = [
  { name:'TOMAHAWK', price:7.90 }, { name:'FIORENTINA', price:8.50 }, { name:'COSTATA', price:6.90 },
  { name:'T-BONE', price:7.50 }, { name:'CONTROFILETTO', price:8.90 }, { name:'FILETTO', price:9.50 },
  { name:'PICANHA', price:6.80 }, { name:'ENTRECÔTE', price:7.20 }, { name:'CANGURO', price:6.50 },
  { name:'AGNELLO', price:7.00 }, { name:'MAIALE', price:4.90 }, { name:'POLLO', price:3.50 }
];

const € = n => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n||0));
const todayKey = () => new Date().toISOString().slice(0,10);
const uid = () => Math.random().toString(36).slice(2,10);

let db, selectedTable = 1, selectedMeat = null, meats = [], orders = [], selectedIds = new Set(), adminOk=false;

const el = id => document.getElementById(id);
const toast = msg => { el('toast').textContent=msg; el('toast').style.display='block'; setTimeout(()=>el('toast').style.display='none',2600); };

async function init(){
  try{
    const app = initializeApp(window.firebaseConfig);
    db = getFirestore(app);
    await ensureMeats();
    bindUI();
    renderTables();
    listenMeats();
    listenOrders();
    setStatus('ONLINE - SINCRONIZZATO','ok');
  }catch(e){
    console.error(e);
    setStatus('ERRORE FIREBASE','err');
    toast('Errore Firebase: controlla config e regole');
  }
}

function setStatus(text,type){ const s=el('status'); s.textContent=text; s.className='status '+type; }

async function ensureMeats(){
  const ref = doc(db,'settings','meats');
  const snap = await getDoc(ref);
  if(!snap.exists()) await setDoc(ref,{ list: DEFAULT_MEATS, updatedAt: serverTimestamp() });
}

function bindUI(){
  el('tabGriglia').onclick=()=>show('Griglia'); el('tabCassa').onclick=()=>show('Cassa'); el('tabAdmin').onclick=()=>show('Admin');
  el('weightInput').oninput=calc;
  el('clearBtn').onclick=()=>{ el('weightInput').value=''; calc(); };
  el('sendBtn').onclick=sendOrder;
  el('mergeBtn').onclick=mergeSelected;
  el('clearDoneBtn').onclick=clearDone;
  el('loginBtn').onclick=()=>{ if(el('pinInput').value==='1234'){ adminOk=true; el('pinBox').classList.add('hidden'); el('adminPanel').classList.remove('hidden'); renderAdmin(); } else toast('PIN non corretto'); };
  el('addMeatBtn').onclick=()=>{ meats.push({name:'NUOVA CARNE', price:0}); renderAdmin(); renderMeats(); };
  el('saveMeatsBtn').onclick=saveAdminMeats;
  el('resetMeatsBtn').onclick=async()=>{ if(confirm('Ripristinare le carni base?')) await setDoc(doc(db,'settings','meats'),{list:DEFAULT_MEATS,updatedAt:serverTimestamp()}); };
}

function show(name){
  ['Griglia','Cassa','Admin'].forEach(n=>{ el('tab'+n).classList.toggle('active',n===name); el('view'+n).classList.toggle('active',n===name); });
}

function renderTables(){
  const g=el('tablesGrid'); g.innerHTML='';
  for(let i=1;i<=30;i++){
    const b=document.createElement('button'); b.textContent=i; b.className=i===selectedTable?'active':'';
    b.onclick=()=>{ selectedTable=i; el('selectedTableText').textContent=i; renderTables(); };
    g.appendChild(b);
  }
}

function listenMeats(){
  onSnapshot(doc(db,'settings','meats'), snap=>{
    meats = snap.exists() ? (snap.data().list||DEFAULT_MEATS) : DEFAULT_MEATS;
    if(!selectedMeat || !meats.find(m=>m.name===selectedMeat.name)) selectedMeat=meats[0];
    renderMeats(); renderAdmin(); calc();
  }, err=>{ console.error(err); setStatus('ERRORE DATABASE','err'); });
}

function renderMeats(){
  const g=el('meatsGrid'); g.innerHTML='';
  meats.forEach(m=>{
    const b=document.createElement('button'); b.innerHTML=`${m.name}<small>${Number(m.price).toFixed(2).replace('.',',')} €/100G</small>`;
    b.className=selectedMeat && selectedMeat.name===m.name?'active':'';
    b.onclick=()=>{ selectedMeat=m; renderMeats(); calc(); };
    g.appendChild(b);
  });
}

function calc(){
  const w=Number(el('weightInput').value||0), p=Number(selectedMeat?.price||0), total=w/100*p;
  el('priceText').textContent=€(p); el('totalText').textContent=€(total); return {w,p,total};
}

async function sendOrder(){
  const {w,p,total}=calc();
  if(!selectedMeat) return toast('Seleziona una carne');
  if(!w || w<=0) return toast('Inserisci il peso');
  try{
    await addDoc(collection(db,'orders'),{
      table:selectedTable, meatName:selectedMeat.name, pricePer100:p, weight:w, total:Math.round(total*100)/100,
      status:'pending', day:todayKey(), createdAt:serverTimestamp(), updatedAt:serverTimestamp()
    });
    el('weightInput').value=''; calc(); toast('Inviato alla cassa'); show('Cassa');
  }catch(e){ console.error(e); toast('Errore invio alla cassa'); }
}

function listenOrders(){
  const q=query(collection(db,'orders'), orderBy('createdAt','desc'));
  onSnapshot(q, snap=>{
    orders=snap.docs.map(d=>({id:d.id,...d.data()})).filter(o=>o.day===todayKey());
    renderOrders(); setStatus('ONLINE - SINCRONIZZATO','ok');
  }, err=>{ console.error(err); setStatus('ERRORE DATABASE','err'); toast('Errore lettura database'); });
}

function renderOrders(){
  const pending=orders.filter(o=>o.status==='pending'); const done=orders.filter(o=>o.status==='done');
  el('badgePending').textContent=pending.length; el('pendingCount').textContent=pending.length; el('doneCount').textContent=done.length;
  el('dayTotal').textContent=€(orders.reduce((s,o)=>s+Number(o.total||0),0));
  el('pendingList').innerHTML=pending.length?'':'<p class="muted">Nessuna carne da inserire.</p>';
  pending.sort((a,b)=>a.table-b.table).forEach(o=>el('pendingList').appendChild(orderEl(o,true)));
  el('doneList').innerHTML=done.length?'':'<p class="muted">Nessuna carne inserita.</p>';
  done.slice(0,30).forEach(o=>el('doneList').appendChild(orderEl(o,false)));
}

function orderEl(o,pending){
  const d=document.createElement('div'); d.className='order '+(pending?'pending':'done');
  const checked=selectedIds.has(o.id)?'checked':'';
  d.innerHTML=`<input class="check" type="checkbox" ${checked} ${pending?'':'disabled'}>
    <div><div class="orderTitle">Tav. ${o.table} - ${o.meatName}</div><div class="orderSub">${o.weight} g · ${Number(o.pricePer100).toFixed(2).replace('.',',')} €/100g</div></div>
    <div class="orderPrice">${€(o.total)}</div>
    <div class="orderBtns">${pending?'<button class="btnDone">✓ INSERITO</button><button class="btnDelete">ELIMINA</button>':'<button class="btnEdit">↩ RIPRISTINA</button><button class="btnDelete">ELIMINA</button>'}</div>`;
  d.querySelector('.check').onchange=e=>{ e.target.checked?selectedIds.add(o.id):selectedIds.delete(o.id); };
  const buttons=d.querySelectorAll('.orderBtns button');
  buttons[0].onclick=()=> updateDoc(doc(db,'orders',o.id),{status:pending?'done':'pending',updatedAt:serverTimestamp()});
  buttons[1].onclick=()=>{ if(confirm('Eliminare questa riga?')) deleteDoc(doc(db,'orders',o.id)); };
  return d;
}

async function mergeSelected(){
  const chosen=orders.filter(o=>selectedIds.has(o.id)&&o.status==='pending');
  if(chosen.length<2) return toast('Seleziona almeno 2 righe da unire');
  const first=chosen[0];
  const same=chosen.every(o=>o.table===first.table && o.meatName===first.meatName && Number(o.pricePer100)===Number(first.pricePer100));
  if(!same) return toast('Puoi unire solo stesso tavolo, carne e prezzo');
  const weight=chosen.reduce((s,o)=>s+Number(o.weight||0),0), total=chosen.reduce((s,o)=>s+Number(o.total||0),0);
  const batch=writeBatch(db);
  chosen.forEach(o=>batch.delete(doc(db,'orders',o.id)));
  batch.set(doc(collection(db,'orders')), {table:first.table, meatName:first.meatName+' ×'+chosen.length, pricePer100:first.pricePer100, weight, total:Math.round(total*100)/100, status:'pending', day:todayKey(), createdAt:serverTimestamp(), updatedAt:serverTimestamp(), merged:true});
  await batch.commit(); selectedIds.clear(); toast('Righe unite');
}

async function clearDone(){
  const done=orders.filter(o=>o.status==='done'); if(!done.length) return;
  if(!confirm('Eliminare le righe già inserite di oggi?')) return;
  const batch=writeBatch(db); done.forEach(o=>batch.delete(doc(db,'orders',o.id))); await batch.commit(); toast('Inseriti puliti');
}

function renderAdmin(){
  if(!adminOk) return;
  const box=el('adminMeats'); box.innerHTML='';
  meats.forEach((m,i)=>{
    const r=document.createElement('div'); r.className='adminRow';
    r.innerHTML=`<input data-i="${i}" data-k="name" value="${m.name||''}"><input data-i="${i}" data-k="price" type="number" step="0.01" value="${m.price||0}"><button>×</button>`;
    r.querySelector('button').onclick=()=>{ meats.splice(i,1); renderAdmin(); renderMeats(); };
    box.appendChild(r);
  });
}

async function saveAdminMeats(){
  const rows=[...document.querySelectorAll('#adminMeats input')];
  rows.forEach(inp=>{ const i=Number(inp.dataset.i), k=inp.dataset.k; meats[i][k]=k==='price'?Number(inp.value):inp.value.toUpperCase(); });
  meats=meats.filter(m=>m.name && Number(m.price)>=0);
  await setDoc(doc(db,'settings','meats'),{list:meats,updatedAt:serverTimestamp()}); toast('Carni salvate');
}

init();
