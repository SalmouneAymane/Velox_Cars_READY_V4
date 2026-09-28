(function(){
  'use strict';
  const CFG=window.VELOX_CONFIG||{};
  const configured=CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_URL.includes('YOUR-PROJECT') && !CFG.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  let sb=null;
  function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Supabase library could not be loaded.'));document.head.appendChild(s)})}
  function msg(e){return e?.message||e?.error_description||String(e)}
  async function init(){if(!configured)return false;if(!window.supabase)await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);window.veloxSupabase=sb;return true}
  async function remoteDB(){
    const [cars,settings,res,search,blocks]=await Promise.all([
      sb.from('cars').select('*').order('sort_order',{ascending:true}),
      sb.from('settings').select('*').eq('id',1).maybeSingle(),
      sb.from('reservations').select('*').order('created_at',{ascending:false}),
      sb.from('search_requests').select('*').order('created_at',{ascending:false}),
      sb.from('car_blocks').select('*').order('start_at')
    ]);
    for(const x of [cars,settings,res,search,blocks])if(x.error)throw x.error;
    return {settings:settings.data||{},cars:(cars.data||[]).map(c=>({id:c.id,name:c.name,color:c.color||'',year:c.year||'',gear:c.gear||'',fuel:c.fuel||'',description:c.description||'',features:c.features||[],prices:c.prices||{},images:c.images||[],active:c.active!==false})),reservations:(res.data||[]).map(r=>({id:r.id,carId:r.car_id,carName:r.car_name||r.car_id,firstName:r.first_name,whatsapp:r.whatsapp,nationality:r.nationality,birth:r.birth,license:r.license,start:r.start_at,end:r.end_at,days:r.days,total:r.total,status:r.status,message:r.message,pickup:r.pickup,dropoff:r.dropoff})),searchRequests:(search.data||[]).map(r=>({id:r.id,name:r.name,whatsapp:r.whatsapp,car:r.car,gear:r.gear,start:r.start_at,end:r.end_at,budget:r.budget,message:r.message,status:r.status||'En attente',createdAt:r.created_at})),blocked:(blocks.data||[]).map(b=>({id:b.id,carId:b.car_id,start:b.start_at,end:b.end_at}))};
  }
  async function refresh(){DB=await remoteDB();render();return DB}
  async function authBoot(){
    if(!configured)return false;
    if(!(await init()))return false;
    const {data}=await sb.auth.getSession();
    if(data.session){document.getElementById('login').style.display='none';document.getElementById('app').style.display='block';await refresh();}
    else {document.getElementById('login').style.display='flex';document.getElementById('app').style.display='none'}
    sb.auth.onAuthStateChange((_e,session)=>{if(session){document.getElementById('login').style.display='none';document.getElementById('app').style.display='block';refresh()}else{document.getElementById('login').style.display='flex';document.getElementById('app').style.display='none'}});
    sb.channel('velox-admin').on('postgres_changes',{event:'*',schema:'public',table:'reservations'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'search_requests'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'cars'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'car_blocks'},refresh).subscribe();
    return true;
  }
  window.login=async function(){
    if(!configured){$('#err').textContent='Configurez config.js pour activer la connexion Admin sécurisée.';return}
    $('#err').textContent='Connexion…';try{const {error}=await sb.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#pass').value});if(error)throw error;$('#err').textContent=''}catch(e){$('#err').textContent=msg(e)}
  };
  window.logout=async function(){if(sb)await sb.auth.signOut();else location.reload()};
  window.status=async function(id,s){try{const {error}=await sb.from('reservations').update({status:s}).eq('id',id);if(error)throw error;await refresh()}catch(e){alert(msg(e))}};
  window.saveCar=async function(id){
    const base=id?DB.cars.find(x=>x.id===id):{id:crypto.randomUUID(),images:[],features:[],active:true};
    if(!base)return alert('Voiture introuvable.');
    const row={id:base.id,name:$('#cn').value.trim(),color:$('#cc').value.trim(),year:$('#cy').value.trim(),gear:$('#cg').value,fuel:$('#cf').value,description:$('#cd').value.trim(),prices:{p1:+$('#p1').value,p2:+$('#p2').value,p3:+$('#p3').value},features:base.features||[],images:base.images||[],active:true,sort_order:DB.cars.findIndex(x=>x.id===id)};
    if(!row.name)return alert('Veuillez saisir le nom de la voiture.');
    try{
      const files=[...$('#photos').files];
      for(const f of files){const ext=(f.name.split('.').pop()||'jpg').toLowerCase();const path=`${row.id}/${crypto.randomUUID()}.${ext}`;const up=await sb.storage.from('car-images').upload(path,f,{upsert:false,contentType:f.type});if(up.error)throw up.error;const pub=sb.storage.from('car-images').getPublicUrl(path).data.publicUrl;row.images.push(pub)}
      const {error}=await sb.from('cars').upsert(row);if(error)throw error;await refresh();closeM();
    }catch(e){alert(msg(e))}
  };
  window.removeCar=async function(id){if(!confirm('Supprimer cette voiture ?'))return;try{const {error}=await sb.from('cars').update({active:false}).eq('id',id);if(error)throw error;await refresh()}catch(e){alert(msg(e))}};
  window.blockCar=async function(){const carId=$('#bcar').value,start=$('#bstart').value,end=$('#bend').value;if(!start||!end)return alert('Choisissez les deux dates.');if(new Date(end)<=new Date(start))return alert('La fin doit être après le début.');try{const {error}=await sb.from('car_blocks').insert({car_id:carId,start_at:new Date(start).toISOString(),end_at:new Date(end).toISOString()});if(error)throw error;await refresh()}catch(e){alert(msg(e))}};
  window.unblock=async function(id){try{const {error}=await sb.from('car_blocks').delete().eq('id',id);if(error)throw error;await refresh()}catch(e){alert(msg(e))}};
  window.saveSettings=async function(){try{const {error}=await sb.from('settings').upsert({id:1,whatsapp:$('#setwa').value,phone:$('#setphone').value,email:$('#setemail').value,address:$('#setaddress').value});if(error)throw error;await refresh();alert('Enregistré')}catch(e){alert(msg(e))}};
  // Prevent legacy auto-login from exposing the admin in production mode.
  if(configured){document.getElementById('app').style.display='none';document.getElementById('login').style.display='flex'}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>authBoot().catch(e=>console.error(e)));else authBoot().catch(e=>console.error(e));
})();
