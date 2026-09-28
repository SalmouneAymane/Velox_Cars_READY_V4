(function(){
  'use strict';
  const CFG=window.VELOX_CONFIG||{};
  const configured=CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_URL.includes('YOUR-PROJECT') && !CFG.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  window.VELOX_REMOTE_ENABLED=configured;
  let sb=null;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function money(n){return Number(n||0).toLocaleString('fr-FR')+' DH'}
  function errMsg(e){return e?.message||e?.error_description||String(e)}
  async function init(){
    if(!configured){console.warn('[Velox] Supabase is not configured; demo/local mode remains active.');return false}
    if(!window.supabase){await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');}
    sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
    window.veloxSupabase=sb;
    return true;
  }
  function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Supabase library could not be loaded.'));document.head.appendChild(s)})}
  async function queryAll(){
    const [carsR,settingsR,blocksR,intervalsR]=await Promise.all([
      sb.from('cars').select('*').eq('active',true).order('sort_order',{ascending:true}),
      sb.from('settings').select('*').eq('id',1).maybeSingle(),
      sb.from('car_blocks').select('id,car_id,start_at,end_at').order('start_at'),
      sb.rpc('public_car_intervals')
    ]);
    for(const r of [carsR,settingsR,blocksR,intervalsR]) if(r.error) throw r.error;
    const cars=(carsR.data||[]).map(c=>({id:c.id,name:c.name,color:c.color||'',year:c.year||'',gear:c.gear||'',fuel:c.fuel||'',description:c.description||'',features:c.features||[],prices:c.prices||{p1:0,p2:0,p3:0},images:c.images||[],active:c.active!==false}));
    const settings=settingsR.data||{whatsapp:'212668353949',phone:'+212 668-353949',email:'contact@veloxcars.ma',address:'Maroc'};
    const blocked=(blocksR.data||[]).map(b=>({id:b.id,carId:b.car_id,start:b.start_at,end:b.end_at}));
    const intervals=(intervalsR.data||[]).map(x=>({carId:x.car_id,start:x.start_at,end:x.end_at,type:x.type||'booked'}));
    const reservations=intervals.map(x=>({carId:x.carId,start:x.start,end:x.end,status:x.type==='blocked'?'Bloquée':'Confirmée'}));
    return {settings,cars,blocked,reservations,searchRequests:[]};
  }
  async function refresh(){
    if(!sb)return;
    const d=await queryAll();
    try{localStorage.setItem('velox_db_cache',JSON.stringify(d))}catch(_){ }
    window.__VELOX_REMOTE_DB=d;
    if(typeof cars!=='undefined') cars=d.cars;
    if(typeof DB!=='undefined') DB=d;
    if(typeof render==='function' && typeof cars!=='undefined') render(cars);
    return d;
  }
  async function rpc(name,args){const r=await sb.rpc(name,args);if(r.error)throw r.error;return r.data}
  window.__VELOX_CLIENT={init,refresh,getDB:()=>window.__VELOX_REMOTE_DB||{},rpc,configured};

  // Replace client persistence with online data.
  window.getDB=function(){return window.__VELOX_REMOTE_DB || (()=>{try{return JSON.parse(localStorage.getItem('velox_db_cache'))||defaultDB()}catch(_){return defaultDB()}})()};
  window.saveDB=function(){return Promise.resolve()};
  window.activeIntervals=function(carId){
    const d=window.__VELOX_REMOTE_DB||{};
    const out=[];
    (d.blocked||[]).filter(x=>x.carId===carId).forEach(x=>out.push({start:x.start,end:x.end,type:'blocked'}));
    (d.reservations||[]).filter(x=>x.carId===carId).forEach(x=>out.push({start:x.start,end:x.end,type:x.status==='Bloquée'?'blocked':'booked'}));
    return out.sort((a,b)=>new Date(a.start)-new Date(b.start));
  };
  window.filterCars=function(cat){
    const all=(window.__VELOX_REMOTE_DB?.cars||[]).filter(c=>c.active!==false);
    let list=all;
    if(cat && cat!=='all') list=all.filter(c=>String(c.gear||'').toLowerCase().includes(String(cat).toLowerCase())||String(c.fuel||'').toLowerCase().includes(String(cat).toLowerCase()));
    if(typeof render==='function') render(list);
  };
  window.openBooking=function(carId){
    const list=window.__VELOX_REMOTE_DB?.cars||[]; const c=list.find(x=>x.id===carId)||list[0];
    if(!c){alert('Cette voiture est indisponible.');return;}
    showForm(tr('bookingTitle'),`<div class="notice">${tr('bookingNotice')}</div><div class="form"><div class="field full"><label>${tr('car')}</label><select id="car">${list.map(x=>`<option value="${esc(x.id)}" ${x.id===c.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label>${tr('name')} *</label><input id="firstName"></div><div class="field"><label>${tr('nationality')}</label><input id="nationality"></div><div class="field"><label>WhatsApp *</label><input id="whatsapp" placeholder="+212..."></div><div class="field"><label>${tr('birth')}</label><input id="birth" type="date"></div><div class="field"><label>${tr('license')}</label><input id="license" type="date"></div><div class="field"><label>${tr('start')} *</label><input id="start" type="datetime-local"></div><div class="field"><label>${tr('end')} *</label><input id="end" type="datetime-local"></div><div class="field"><label>${tr('pickup')}</label><input id="pickup"></div><div class="field"><label>${tr('dropoff')}</label><input id="dropoff"></div><div class="field full"><label>${tr('message')}</label><textarea id="message"></textarea></div><div class="field full"><div id="bookingTotal" class="notice">Total: —</div></div></div><div class="actions"><button class="btn ghost" onclick="closeModal()">${tr('cancel')}</button><button class="btn primary" onclick="submitBooking()">${tr('sendBooking')}</button></div>`);
    const update=()=>{
      const a=$('#start')?.value,b=$('#end')?.value,car=(window.__VELOX_REMOTE_DB?.cars||[]).find(x=>x.id===$('#car')?.value);let total=0,days=0;
      if(a&&b&&new Date(b)>new Date(a)){days=Math.ceil((new Date(b)-new Date(a))/86400000);total=(days<=3?car.prices.p1:days<=9?car.prices.p2:car.prices.p3)*days}
      const el=$('#bookingTotal');if(el)el.textContent=days?`Total: ${money(total)} · ${days} jour${days>1?'s':''}`:'Total: —';
    };
    ['car','start','end'].forEach(id=>$('#'+id)?.addEventListener('input',update));
    update();
  };
  window.openAvailability=function(id){
    const list=window.__VELOX_REMOTE_DB?.cars||[];calCar=list.find(c=>c.id===id);calDate=new Date();showForm(calCar?calCar.name:'Disponibilité',`<div class="avModal"><div id="calendarMount"></div><div style="margin-top:18px"><div class="eyebrow">${tr('priceSchedule')}</div>${tierHtml(calCar)}</div></div>`);renderCalendar();
  };
  window.submitBooking=async function(){
    if(!sb){alert('Le site est en mode local. Configurez Supabase pour envoyer une réservation.');return}
    const carId=$('#car')?.value, firstName=$('#firstName')?.value.trim(), whatsapp=$('#whatsapp')?.value.trim(), start=$('#start')?.value, end=$('#end')?.value;
    if(!carId||!firstName||!whatsapp||!start||!end){alert('Veuillez remplir les champs obligatoires.');return}
    if(new Date(end)<=new Date(start)){alert('La date de fin doit être après la date de début.');return}
    const car=(window.__VELOX_REMOTE_DB?.cars||[]).find(c=>c.id===carId);if(!car){alert('Voiture introuvable.');return}
    const days=Math.ceil((new Date(end)-new Date(start))/86400000);const daily=days<=3?car.prices.p1:days<=9?car.prices.p2:car.prices.p3;const total=days*daily;
    const payload={p_car_id:carId,p_first_name:firstName,p_nationality:$('#nationality')?.value||null,p_whatsapp:whatsapp,p_birth:$('#birth')?.value||null,p_license:$('#license')?.value||null,p_start:new Date(start).toISOString(),p_end:new Date(end).toISOString(),p_pickup:$('#pickup')?.value||null,p_dropoff:$('#dropoff')?.value||null,p_message:$('#message')?.value||null,p_days:days,p_total:total};
    try{await rpc('create_reservation',payload);await refresh();showForm('Réservation envoyée ✓',`<div class="notice">Votre demande a été envoyée avec succès. Nous allons vous contacter sur WhatsApp.</div><div style="text-align:right"><button class="btn primary" onclick="closeModal()">OK</button></div>`)}catch(e){alert(errMsg(e).includes('overlap')?'Cette voiture est déjà réservée pendant cette période. Choisissez d’autres dates.':errMsg(e))}
  };
  window.submitSearch=async function(){
    const x={name:$('#sname')?.value.trim(),whatsapp:$('#swa')?.value.trim(),car:$('#scar')?.value.trim(),gear:$('#sgear')?.value,start:$('#sstart')?.value||null,end:$('#send')?.value||null,budget:$('#sbudget')?.value||null,message:$('#smsg')?.value||null};
    if(!x.name||!x.whatsapp||!x.car){alert('Veuillez remplir les champs obligatoires.');return}
    if(!sb){alert('Le site est en mode local. Configurez Supabase pour envoyer la demande.');return}
    try{await sb.from('search_requests').insert({name:x.name,whatsapp:x.whatsapp,car:x.car,gear:x.gear,start_at:x.start?new Date(x.start).toISOString():null,end_at:x.end?new Date(x.end).toISOString():null,budget:x.budget?Number(x.budget):null,message:x.message});showForm('Demande reçue ✓','<div class="notice">Votre demande a été enregistrée et apparaît dans l’administration.</div><div style="text-align:right"><button class="btn primary" onclick="closeModal()">Fermer</button></div>')}catch(e){alert(errMsg(e))}
  };
  async function boot(){
    try{if(!(await init()))return;await refresh();
      // keep client current when admin changes data in another browser/tab
      sb.channel('velox-public').on('postgres_changes',{event:'*',schema:'public',table:'cars'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'car_blocks'},refresh).subscribe();
    }catch(e){console.error(e);const n=document.createElement('div');n.style='position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;padding:12px 14px;border-radius:12px;background:#1d2430;color:#fff;font:14px system-ui';n.textContent='Velox Cars: impossible de charger les données en ligne. Vérifiez config.js et Supabase.';document.body.appendChild(n)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
