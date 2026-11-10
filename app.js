import {createClient} from '@supabase/supabase-js';

const db = createClient('https://ybyfecibshwmqalyljiv.supabase.co', 'sb_publishable_rYEaqokQ_QsmmZOAEjpL-Q_BuwdwZ_u');
const $ = id => document.getElementById(id);
const statuses = ['Saved','Applied','Interview','Offer','Closed'];
let jobs = [], tracked = new Map(), user = null, limit = 25, feed = null, syncing = false, authVersion = 0;
const node = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
const date = value => Number.isNaN(Date.parse(value)) ? 'Date unavailable' : new Intl.DateTimeFormat('en-IN', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value));
function safeURL(value) {
  try { const p = new URL(value); return p.protocol === 'https:' && !p.username && !p.password && p.hostname.includes('.') && !/^(localhost|127\.|0\.|10\.|192\.168\.)/.test(p.hostname) ? p.href : null; } catch { return null; }
}
function notice(text) { $('notice').textContent = text; }
function view() { return ['tracker','sources'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'explore'; }
function requireUser() { if (user) return true; $('auth-dialog').showModal(); return false; }
function sourceLinks() {
  const q = $('query').value.trim() || 'HR analyst automation';
  const loc = $('location').value || 'India';
  return {
    Google: `https://www.google.com/search?q=${encodeURIComponent(`${q} jobs ${loc} apply`)}`,
    LinkedIn: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=${encodeURIComponent(loc)}&f_TPR=r86400`,
    Naukri: `https://www.naukri.com/${q.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-jobs`,
    Indeed: `https://in.indeed.com/jobs?q=${encodeURIComponent(q)}&l=${encodeURIComponent(loc)}`,
    Glassdoor: 'https://www.glassdoor.co.in/Job/index.htm',
    Foundit: 'https://www.foundit.in/search/jobs',
    Wellfound: 'https://wellfound.com/jobs',
  };
}
function renderSources() {
  $('source-list').replaceChildren();
  for (const s of feed?.sources || []) {
    const card = node('article',null,'source-card');
    card.append(node('h3',s.name),node('p',`${s.provider} · ${s.count} vacancies checked`),node('span','Live employer feed','tag'));
    $('source-list').append(card);
  }
  for (const s of feed?.errors || []) {
    const card = node('article',null,'source-card'); card.append(node('h3',s.source),node('p','Refresh unavailable. No fresh listing claim.')); $('source-list').append(card);
  }
  $('portal-grid').replaceChildren();
  for (const [name,url] of Object.entries(sourceLinks())) { const a=node('a',`${name} ↗`); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; const c=node('div',null,'source-card'); c.append(a,node('p','Search shortcut · not imported')); $('portal-grid').append(c); }
}
function render() {
  const active = view();
  document.querySelectorAll('[data-view]').forEach(a => a.setAttribute('aria-current', a.dataset.view===active?'page':'false'));
  $('workspace').hidden = active==='sources'; $('source-panel').hidden = active!=='sources';
  $('tracker-tools').hidden = active!=='tracker'; $('status-filter').hidden = active!=='tracker';
  for(const id of ['location','track','junior'])$(id).closest('label').hidden=active==='tracker';
  $('view-label').textContent = active==='tracker' ? 'YOUR PRIVATE APPLICATION TRACKER' : 'EXPLORE OPPORTUNITIES';
  $('account').textContent = user ? 'Sign out' : 'Sign in';
  $('tracker-count').textContent = String(tracked.size);
  for (const status of statuses.slice(0,4)) $(`stat-${status.toLowerCase()}`).textContent = String([...tracked.values()].filter(j=>j.status===status).length);
  const links = sourceLinks(); for (const name of ['Google','LinkedIn','Naukri']) $(name.toLowerCase()).href=links[name];
  renderSources();
  const root=$('cards'); root.replaceChildren();
  if (active==='tracker' && !user) {
    $('count').textContent='Your search. Your private space.';
    const box=node('div',null,'empty'); const b=node('button','Sign in to view your tracker','primary'); b.onclick=requireUser;
    box.append(node('h3','Keep your progress with you.'),node('p','Save jobs and update application statuses from any device.'),b); root.append(box); $('more').hidden=true; return;
  }
  const q=$('query').value.toLowerCase().trim(),loc=$('location').value.toLowerCase();
  const aliases={india:/india|coimbatore|kerala|kochi|bengaluru|bangalore|karnataka|mumbai|goa|chennai|hyderabad|noida|gurgaon|gurugram|delhi|pune|worldwide|anywhere/i,kerala:/kerala|kochi|cochin|ernakulam|thrissur|palakkad|trivandrum|thiruvananthapuram|kozhikode|calicut|kannur|kollam/i,bengaluru:/bengaluru|bangalore/i,karnataka:/karnataka|bengaluru|bangalore|mysore|mysuru|mangalore|mangaluru/i};
  const base=active==='tracker'?[...tracked.values()].map(j=>({...j,url:j.job_url,checked_at:j.updated_at,snippet:'Saved to your private tracker.',track:'',early_career:true})):jobs;
  let list=base.filter(j=>(!q||`${j.title} ${j.company} ${j.snippet||''}`.toLowerCase().includes(q)) && (active==='tracker'||!loc||(aliases[loc]?aliases[loc].test(j.location):j.location.toLowerCase().includes(loc))) && (active==='tracker'||!$('track').value||j.track===$('track').value) && (!$('source').value||j.source===$('source').value) && (active==='tracker'||!$('junior').checked||j.early_career) && (active!=='tracker'||!$('status').value||j.status===$('status').value));
  list.sort((a,b)=>$('sort').value==='checked'?(b.checked_at||'').localeCompare(a.checked_at||''):a[$('sort').value].localeCompare(b[$('sort').value]));
  $('count').textContent=`${list.length} ${active==='tracker'?(list.length===1?'tracked job':'tracked jobs'):(list.length===1?'opportunity':'opportunities')}`;
  for (const j of list.slice(0,limit)) {
    const c=node('article',null,'card'),body=node('div'); c.append(node('div',j.company.slice(0,2).toUpperCase(),'logo'),body);
    body.append(node('h3',j.title),node('p',`${j.company} · ${j.location||'See listing'}`,'company'));
    const tags=node('div',null,'tags'); for (const t of [j.track,j.source,active==='tracker'?j.status:j.experience_required==null?'Experience unspecified':`${j.experience_required}+ years requested`].filter(Boolean)) tags.append(node('span',t,'tag'));
    body.append(tags,node('p',j.snippet,'snippet'));
    const actions=node('div',null,'actions'),link=node('a','Open application ↗','apply'); link.href=safeURL(j.url); link.target='_blank'; link.rel='noopener noreferrer'; actions.append(link);
    if (active==='tracker') {
      const label=node('label','Status','inline-label'),select=node('select'); select.setAttribute('aria-label',`Status for ${j.title} at ${j.company}`);
      for(const s of statuses){const option=node('option',s);option.value=s;select.append(option);} select.value=j.status;
      select.onchange=async()=>{select.disabled=true;try{await changeStatus(j,select.value);}catch(e){notice(e.message);select.value=j.status;}finally{select.disabled=false;}};
      label.append(select);actions.append(label);
    } else {
      const existing=tracked.get(j.url),b=node('button',existing?`✓ ${existing.status}`:'+ Track & open','save');
      b.setAttribute('aria-label',`${existing?'Open tracked job':'Track and open'}: ${j.title} at ${j.company}`);
      b.onclick=async()=>{if(!requireUser())return;window.open(j.url,'_blank','noopener,noreferrer');b.disabled=true;try{await saveJob(j);notice('Job saved. Mark it Applied after completing the employer’s form.');}catch(e){notice(`The posting opened, but saving failed: ${e.message}`);}finally{b.disabled=false;}};
      actions.append(b);
    }
    body.append(actions,node('div',`${active==='tracker'?'Tracker updated':'Source checked'} ${date(j.checked_at)} IST`,'meta'));root.append(c);
  }
  if(!list.length){const box=node('div',null,'empty');box.append(node('h3',active==='tracker'?'Your next chapter starts with one saved job.':'No jobs match these filters.'),node('p',active==='tracker'?'Use + Track & open on a listing, or add a job link from any portal.':'Try another role or location. You can also search the portals directly.'));root.append(box);}
  $('more').hidden=list.length<=limit;
}
async function syncTracker() {
  if(!user||syncing)return;
  const version=authVersion,uid=user.id;syncing=true;$('sync-status').textContent='Syncing your private tracker…';
  try {
    const {data,error}=await db.from('tracked_jobs').select('*').eq('user_id',uid).order('updated_at',{ascending:false});if(error)throw error;
    if(version!==authVersion)return;
    tracked=new Map(data.filter(j=>safeURL(j.job_url)).map(j=>[j.job_url,j]));$('sync-status').textContent=`Synced · ${date(new Date().toISOString())} IST`;render();
  } catch(e){if(version===authVersion)$('sync-status').textContent=`Sync failed: ${e.message}`;} finally {syncing=false;if(version!==authVersion&&user)setTimeout(syncTracker,0);}
}
async function saveJob(j) {
  if(!user)throw Error('Sign in before saving.');
  const url=safeURL(j.url);if(!url)throw Error('Use an HTTPS job link.');if(tracked.has(url))return;
  const row={user_id:user.id,job_url:url,title:j.title,company:j.company,location:j.location||'',source:j.source||'Added by you',status:'Saved'};
  const {data,error}=await db.from('tracked_jobs').upsert(row,{onConflict:'user_id,job_url',ignoreDuplicates:true}).select();if(error)throw error;
  if(user?.id!==row.user_id)return;
  if(data?.[0])tracked.set(url,data[0]);else await syncTracker();render();
}
async function changeStatus(j,status) {
  if(!user||!statuses.includes(status))throw Error('Sign in and select a valid status.');
  const uid=user.id;
  const {data,error}=await db.from('tracked_jobs').update({status,updated_at:new Date().toISOString()}).eq('user_id',uid).eq('job_url',j.job_url).select().single();if(error)throw error;
  if(user?.id!==uid)return;
  tracked.set(j.job_url,data);render();notice(`Status updated to ${status}.`);
}
async function loadFeed() {
  $('refresh').disabled=true;
  try {
    const r=await fetch('https://abteeeen.github.io/next-chapter-jobs/jobs.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Feed unavailable');const data=await r.json();
    if(!Array.isArray(data.jobs)||!Array.isArray(data.sources))throw Error('Invalid feed');feed=data;jobs=data.jobs.filter(j=>safeURL(j.url)&&typeof j.title==='string'&&typeof j.company==='string'&&typeof j.location==='string');
    $('updated').textContent=`Updated ${date(data.generated_at)} IST`;
    $('health').textContent=`${data.scanned} vacancies checked across ${data.sources.length} employer boards.${data.errors?.length?' Some sources could not refresh.':''}${Date.now()-Date.parse(data.generated_at)>36*3600000?' Feed is over 36 hours old. Verify openings on the source site.':''}`;render();
  }catch(e){$('updated').textContent='Latest feed unavailable';$('health').textContent='Could not refresh listings. Your private tracker and portal search links remain available.';render();}finally{$('refresh').disabled=false;}
}
async function authenticate(signup=false) {
  if(!$('auth-form').reportValidity())return;
  $('login').disabled=$('signup').disabled=true;$('auth-message').textContent=signup?'Creating your account…':'Signing in…';
  try {
    const credentials={email:$('email').value.trim(),password:$('password').value};
    const {data,error}=signup?await db.auth.signUp({...credentials,options:{emailRedirectTo:location.origin+location.pathname}}):await db.auth.signInWithPassword(credentials);
    if(error)throw error;
    $('password').value='';
    if(data.session){$('auth-dialog').close();notice('Signed in. Your tracker syncs across devices.');}else $('auth-message').textContent='Check your email to confirm your account, then return here to sign in.';
  }catch(e){$('auth-message').textContent=e.message;}finally{$('login').disabled=$('signup').disabled=false;}
}
$('auth-form').onsubmit=e=>{e.preventDefault();authenticate();};$('signup').onclick=()=>authenticate(true);
$('email-link').onclick=async()=>{if(!$('email').reportValidity())return;$('email-link').disabled=true;try{const {error}=await db.auth.signInWithOtp({email:$('email').value.trim(),options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;$('auth-message').textContent='Check your email for a secure sign-in link. Open it on the device you want to use.';}catch(e){$('auth-message').textContent=e.message;}finally{$('email-link').disabled=false;}};
$('account').onclick=async()=>{if(!user){requireUser();return;}const {error}=await db.auth.signOut();if(error)notice(error.message);else notice('Signed out. Your saved jobs remain private in your account.');};
db.auth.onAuthStateChange((event,session)=>{const next=session?.user||null;if(next?.id!==user?.id){authVersion++;tracked=new Map();}user=next;$('sync-status').textContent=user?'Loading your private tracker…':'Sign in to sync your tracker across devices.';render();if(user)setTimeout(syncTracker,0);if(event==='PASSWORD_RECOVERY'){$('auth-dialog').close();$('recovery-dialog').showModal();}});
$('forgot').onclick=async()=>{if(!$('email').reportValidity())return;$('forgot').disabled=true;try{const {error}=await db.auth.resetPasswordForEmail($('email').value.trim(),{redirectTo:location.origin+location.pathname});if(error)throw error;$('auth-message').textContent='If an account exists, a password reset link will arrive by email.';}catch(e){$('auth-message').textContent=e.message;}finally{$('forgot').disabled=false;}};
$('recovery-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const {error}=await db.auth.updateUser({password:$('new-password').value});if(error)throw error;$('new-password').value='';$('recovery-dialog').close();notice('Password updated.');}catch(err){$('recovery-message').textContent=err.message;}finally{b.disabled=false;}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
for(const id of ['query','location','track','source','junior','status','sort'])$(id).addEventListener('input',()=>{limit=25;render();});
$('filters').onsubmit=e=>e.preventDefault();$('reset').onclick=()=>{HTMLFormElement.prototype.reset.call($('filters'));limit=25;render();};$('more').onclick=()=>{limit+=25;render();};
window.addEventListener('hashchange',()=>{limit=25;render();});window.addEventListener('focus',syncTracker);setInterval(()=>{if(!document.hidden)syncTracker();},60000);
$('refresh').onclick=loadFeed;$('sync').onclick=syncTracker;$('add-job').onclick=()=>{if(requireUser())$('job-dialog').showModal();};
$('job-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await saveJob({url:$('job-url').value,title:$('job-title').value.trim(),company:$('job-company').value.trim(),location:$('job-location').value.trim(),source:'Added by you'});$('job-dialog').close();$('job-form').reset();notice('Job added to your private tracker.');}catch(err){$('job-message').textContent=err.message;}finally{b.disabled=false;}};
$('export').onclick=()=>{if(!requireUser())return;const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),jobs:[...tracked.values()].map(({user_id,...j})=>j)},null,2)],{type:'application/json'});const a=node('a');a.href=URL.createObjectURL(blob);a.download='next-chapter-tracker.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
render();loadFeed();
