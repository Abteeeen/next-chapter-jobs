import {createClient} from '@supabase/supabase-js';

const hasAuthLinkError = new URLSearchParams(location.hash.slice(1)).has('error');
const db = createClient('https://ybyfecibshwmqalyljiv.supabase.co', 'sb_publishable_rYEaqokQ_QsmmZOAEjpL-Q_BuwdwZ_u');
const $ = id => document.getElementById(id);
const statuses = ['Saved','Applied','Interview','Offer','Closed'];
const pageSize = 12;
const filterIds = ['query','location','track','source','junior','status','sort'];
const filterDefaults = {query:'',location:'preferred',track:'',source:'',junior:true,status:'',sort:'checked'};
const filterStates = {explore:{...filterDefaults},tracker:{...filterDefaults}};
const preferredLocations = /\b(coimbatore|kerala|kochi|cochin|ernakulam|thrissur|palakkad|trivandrum|thiruvananthapuram|kozhikode|calicut|kannur|kollam|kottayam|bengaluru|bangalore|karnataka|mysore|mysuru|mangalore|mangaluru|mumbai|goa)\b/i;
const indianLocations = /\b(india|chennai|hyderabad|noida|gurgaon|gurugram|delhi|pune|ahmedabad|kolkata|jaipur)\b/i;
const globalRemote = /\b(worldwide|anywhere|global remote|remote global)\b|^remote$/i;
let jobs = [], tracked = new Map(), user = null, limit = pageSize, feed = null, syncing = false, authVersion = 0;
let authReady = false, trackerReady = false, trackerRevision = 0, trackerError = '', feedState = 'loading';
const node = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
const date = value => Number.isNaN(Date.parse(value)) ? 'Date unavailable' : new Intl.DateTimeFormat('en-IN', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value));
function safeURL(value) {
  try { const p = new URL(value); return p.protocol === 'https:' && !p.username && !p.password && p.hostname.includes('.') && !/^(localhost|127\.|0\.|10\.|192\.168\.)/.test(p.hostname) ? p.href : null; } catch { return null; }
}
function notice(text) { $('notice').textContent = text; }
function view() { return ['tracker','sources'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'explore'; }
let activeView = view();
function requireUser() { if (user) return true; $('auth-dialog').showModal(); return false; }
function sourceLinks() {
  const {query,location} = filterStates.explore;
  const q = query.trim() || 'HR analyst automation';
  const loc = ['preferred',''].includes(location) ? 'India' : location;
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
  const sources = feed?.sources || [];
  $('source-summary').textContent = feed
    ? `${feed.scanned} vacancies checked across ${sources.length} employer boards. Portal searches below open in a new tab.`
    : feedState === 'loading' ? 'Checking employer boards…' : 'Employer feed unavailable. Portal searches are available below.';
  const sourceList = $('source-list');
  sourceList.replaceChildren();
  for (const s of sources) {
    const card = node('article',null,'source-card');
    card.append(node('h3',s.name),node('p',`${s.provider} · ${s.count} vacancies checked`));
    sourceList.append(card);
  }
  for (const s of feed?.errors || []) {
    const card = node('article',null,'source-card');
    card.append(node('h3',s.source),node('p','Could not refresh this board.'));
    sourceList.append(card);
  }
  $('portal-grid').replaceChildren();
  for (const [name,url] of Object.entries(sourceLinks())) {
    const card = node('article',null,'source-card');
    card.append(externalLink(`${name} ↗`,url));
    $('portal-grid').append(card);
  }
}

function externalLink(text,url,cls) {
  const link = node('a',text,cls);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function setFilterValues(values) {
  for (const id of filterIds) {
    if (id === 'junior') $(id).checked = values[id];
    else $(id).value = values[id];
  }
}

function rememberFilters() {
  if (activeView === 'sources') return;
  filterStates[activeView] = Object.fromEntries(filterIds.map(id => [id,id === 'junior' ? $(id).checked : $(id).value]));
}

function refreshSourcesFilter(selected = $('source').value) {
  const base = activeView === 'tracker' ? [...tracked.values()] : jobs;
  const names = [...new Set(base.map(j => j.source).filter(Boolean))].sort();
  const select = $('source');
  if ([...select.options].slice(1).map(option => option.value).join('\n') !== names.join('\n')) {
    const all = node('option','All sources');
    all.value = '';
    select.replaceChildren(all,...names.map(name => node('option',name)));
  }
  select.value = names.includes(selected) ? selected : '';
}

function resetFilters() {
  setFilterValues(filterDefaults);
  limit = pageSize;
  rememberFilters();
  render();
}

function matchesLocation(locationText, selected) {
  const text = locationText.trim();
  const preferred = preferredLocations.test(text);
  const india = preferred || indianLocations.test(text);
  const remote = globalRemote.test(text) || (india && /\bremote\b/i.test(text));
  if (selected === 'preferred') return preferred || remote;
  if (selected === 'India') return india || remote;
  if (selected === 'Remote') return /\bremote\b/i.test(text) || globalRemote.test(text);
  if (selected === 'Kerala') return preferred && /\b(kerala|kochi|cochin|ernakulam|thrissur|palakkad|trivandrum|thiruvananthapuram|kozhikode|calicut|kannur|kollam|kottayam)\b/i.test(text);
  if (selected === 'Bengaluru') return /\b(bengaluru|bangalore)\b/i.test(text);
  if (selected === 'Karnataka') return /\b(karnataka|bengaluru|bangalore|mysore|mysuru|mangalore|mangaluru)\b/i.test(text);
  return text.toLowerCase().includes(selected.toLowerCase());
}

function emptyState(title,message,action) {
  const box = node('div',null,'empty');
  box.append(node('h3',title),node('p',message));
  if (action) box.append(action);
  $('cards').append(box);
}

function actionButton(text,handler) {
  const button = node('button',text);
  button.type = 'button';
  button.onclick = handler;
  return button;
}

function renderCard(j,isTracker) {
  const card = node('article',null,isTracker ? 'card tracked' : 'card');
  card.dataset.jobUrl = j.url;
  const head = node('div',null,'card-head');
  const logo = node('div',j.company.slice(0,2).toUpperCase(),'logo');
  logo.setAttribute('aria-hidden','true');
  const title = node('div',null,'card-title');
  title.append(node('h3',j.title),node('p',`${j.company} · ${j.location || 'See listing'}`,'company'));
  head.append(logo,title);
  const status = isTracker ? j.status : tracked.get(j.url)?.status;
  const tags = node('div',null,'tags');
  if (status) {
    const tag = node('span',status,'tag');
    tag.dataset.tone = status.toLowerCase();
    tags.append(tag);
  }
  const experience = j.experience_required == null ? 'Experience unspecified' : `${j.experience_required}+ years requested`;
  for (const label of [j.source,j.track,!isTracker && experience].filter(Boolean)) tags.append(node('span',label,'tag'));
  card.append(head,tags);
  if (j.snippet) card.append(node('p',j.snippet,'snippet'));
  const actions = node('div',null,'actions');
  const actionText = status && status !== 'Saved' ? 'View listing' : 'Open application';
  const link = externalLink(`${actionText} ↗`,safeURL(j.url),'apply');
  link.setAttribute('aria-label',`${actionText} for ${j.title} at ${j.company} (new tab)`);
  actions.append(link);
  if (isTracker) {
    const label = node('label',null,'inline-label');
    const select = node('select');
    select.setAttribute('aria-label',`Status for ${j.title} at ${j.company}`);
    for (const s of statuses) select.append(node('option',s));
    select.value = j.status;
    select.onchange = async () => {
      select.disabled = true;
      try { await changeStatus(j,select.value); }
      catch (error) { notice(error.message); select.value = j.status; }
      finally { select.disabled = false; }
    };
    label.append(select);
    actions.append(label);
  } else if (!status) {
    const button = actionButton('+ Track & open',async () => {
      if (!requireUser()) return;
      window.open(link.href,'_blank','noopener,noreferrer');
      button.disabled = true;
      try { await saveJob(j); notice('Job saved. Update its status in My tracker after you apply.'); }
      catch (error) { notice(`The posting opened, but saving failed: ${error.message}`); }
      finally { button.disabled = false; }
    });
    button.setAttribute('aria-label',`Track and open ${j.title} at ${j.company} (new tab)`);
    actions.append(button);
  }
  card.append(actions,node('p',`${isTracker ? 'Tracker updated' : 'Source checked'} ${date(j.checked_at)} IST`,'meta'));
  return card;
}

function render() {
  const isTracker = activeView === 'tracker';
  const isSources = activeView === 'sources';
  const canSearch = !isTracker || Boolean(user);
  document.querySelectorAll('[data-view]').forEach(a => {
    if (a.dataset.view === activeView) a.setAttribute('aria-current','page');
    else a.removeAttribute('aria-current');
  });
  $('page-title').textContent = {explore:'Explore jobs',tracker:'My tracker',sources:'Job sources'}[activeView];
  $('page-description').textContent = {
    explore:'Find openings and go straight to the employer’s application.',
    tracker:'Save job links and update your status as each application moves forward.',
    sources:'See which employer boards feed your dashboard and search more portals.'
  }[activeView];
  $('feed-status').hidden = isTracker;
  $('workspace').hidden = isSources;
  $('source-panel').hidden = !isSources;
  $('progress').hidden = isSources || !user;
  $('stats').hidden = !user;
  $('view-tracker').hidden = isTracker;
  $('account').textContent = user ? 'Sign out' : 'Sign in';
  $('tracker-count').hidden = !user || !trackerReady;
  $('tracker-count').textContent = String(tracked.size);
  const counts = new Map();
  for (const job of tracked.values()) counts.set(job.status,(counts.get(job.status) || 0) + 1);
  for (const status of statuses) {
    $(`stat-${status.toLowerCase()}`).textContent = trackerReady ? String(counts.get(status) || 0) : '—';
    document.querySelector(`[data-status="${status}"]`).setAttribute('aria-pressed',String(isTracker && $('status').value === status));
  }
  if (isSources) { renderSources(); return; }

  $('filters').hidden = !canSearch;
  $('tracker-tools').hidden = !isTracker || !user;
  $('status-filter').hidden = !isTracker || !user;
  $('sort').closest('label').hidden = !canSearch;
  $('health').hidden = isTracker;
  for (const id of ['location','track','junior']) $(id).closest('label').hidden = isTracker;
  refreshSourcesFilter();
  $('sort').options[0].text = isTracker ? 'Last updated' : 'Most recently checked';
  const selectedLocation = $('location').value;
  const labels = isTracker ? [] : [
    selectedLocation && $('location').selectedOptions[0].text,
    $('track').value,
    $('junior').checked && '0–3 years or unspecified'
  ];
  if ($('source').value) labels.push($('source').value);
  const filters = labels.filter(Boolean);
  $('active-filters').textContent = filters.join(' · ');
  $('filter-summary').textContent = filters.length ? String(filters.length) : '';

  const root = $('cards');
  const focused = document.activeElement;
  const focusedJob = focused?.closest('.card')?.dataset.jobUrl;
  root.replaceChildren();
  $('more').hidden = true;
  if (isTracker && !user) {
    $('count').textContent = authReady ? 'Your private tracker' : 'Checking sign-in…';
    if (authReady) emptyState('Sign in to see your jobs','Saved jobs and application statuses sync across devices.',actionButton('Sign in',requireUser));
    return;
  }
  if (isTracker && !trackerReady) {
    $('count').textContent = trackerError ? 'Tracker unavailable' : 'Loading your tracker…';
    if (trackerError) emptyState('Could not load your tracker',trackerError,actionButton('Try again',syncTracker));
    return;
  }
  if (!isTracker && !feed) {
    $('count').textContent = feedState === 'loading' ? 'Loading jobs…' : 'Job listings unavailable';
    if (feedState !== 'loading') emptyState('Try the feed again','You can also open Sources to search other job portals.',actionButton('Retry listings',loadFeed));
    return;
  }
  const words = $('query').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const base = isTracker ? [...tracked.values()].map(j => ({...j,url:j.job_url,checked_at:j.updated_at,snippet:j.notes})) : jobs;
  const list = base.filter(j => {
    const text = `${j.title} ${j.company} ${j.location} ${j.snippet || ''}`.toLowerCase();
    if (!words.every(word => text.includes(word))) return false;
    if ($('source').value && j.source !== $('source').value) return false;
    if (isTracker) return !$('status').value || j.status === $('status').value;
    return matchesLocation(j.location,selectedLocation) &&
      (!$('track').value || j.track === $('track').value) &&
      (!$('junior').checked || j.early_career);
  });
  const sort = $('sort').value;
  list.sort((a,b) => sort === 'checked' ? (b.checked_at || '').localeCompare(a.checked_at || '') : a[sort].localeCompare(b[sort]));
  const unit = isTracker ? 'tracked job' : 'job';
  $('count').textContent = `${list.length} ${unit}${list.length === 1 ? '' : 's'}`;
  root.append(...list.slice(0,limit).map(j => renderCard(j,isTracker)));
  if (!list.length) {
    if (isTracker && !base.length) emptyState('Your tracker is empty','Add a job link or track an opening from Explore jobs.',actionButton('Add job link',() => $('add-job').click()));
    else emptyState('No jobs match these filters','Clear the search or broaden your filters.',actionButton('Reset filters',resetFilters));
  }
  $('more').hidden = list.length <= limit;
  if (focusedJob) {
    const card = [...root.children].find(entry => entry.dataset.jobUrl === focusedJob);
    (card?.querySelector(focused.tagName.toLowerCase()) || card?.querySelector('a') || $('jobs')).focus({preventScroll:true});
  }
}

async function syncTracker() {
  if (!user || syncing) return;
  const version = authVersion, uid = user.id, revision = trackerRevision;
  syncing = true;
  $('sync').disabled = true;
  $('sync-status').textContent = 'Syncing your tracker…';
  try {
    const {data,error} = await db.from('tracked_jobs').select('*').eq('user_id',uid).order('updated_at',{ascending:false});
    if (error) throw error;
    if (version !== authVersion || revision !== trackerRevision) return;
    const rows = data.filter(j => safeURL(j.job_url));
    const changed = !trackerReady || rows.length !== tracked.size ||
      rows.some(j => JSON.stringify(tracked.get(j.job_url)) !== JSON.stringify(j));
    trackerReady = true;
    trackerError = '';
    $('sync-status').textContent = `Tracker synced · ${date(new Date().toISOString())} IST`;
    if (changed) {
      tracked = new Map(rows.map(j => [j.job_url,j]));
      render();
    }
  } catch (error) {
    if (version !== authVersion) return;
    trackerError = error.message;
    $('sync-status').textContent = 'Tracker sync failed';
    if (!trackerReady) render();
    else if (activeView === 'tracker') notice(`Could not sync your tracker: ${error.message}`);
  } finally {
    syncing = false;
    $('sync').disabled = false;
    if (user && (version !== authVersion || revision !== trackerRevision)) setTimeout(syncTracker,0);
  }
}
async function saveJob(j) {
  if(!user)throw Error('Sign in before saving.');
  const url=safeURL(j.url);if(!url)throw Error('Use an HTTPS job link.');if(tracked.has(url))return;
  const row={user_id:user.id,job_url:url,title:j.title,company:j.company,location:j.location||'',source:j.source||'Added by you',status:'Saved'};
  const {data,error}=await db.from('tracked_jobs').upsert(row,{onConflict:'user_id,job_url',ignoreDuplicates:true}).select();if(error)throw error;
  if(user?.id!==row.user_id)return;
  if (data?.[0]) {
    tracked.set(url,data[0]);
    trackerRevision++;
  }
  await syncTracker();
  render();
}
async function changeStatus(j,status) {
  if(!user||!statuses.includes(status))throw Error('Sign in and select a valid status.');
  const uid=user.id;
  const {data,error}=await db.from('tracked_jobs').update({status,updated_at:new Date().toISOString()}).eq('user_id',uid).eq('job_url',j.job_url).select().single();if(error)throw error;
  if(user?.id!==uid)return;
  tracked.set(j.job_url,data);trackerRevision++;render();notice(`Status updated to ${status}.`);
}
async function loadFeed() {
  if ($('refresh').disabled) return;
  $('refresh').disabled=true;
  feedState = 'loading';
  $('updated').textContent = 'Checking for listings…';
  $('feed-dot').dataset.state = 'loading';
  render();
  try {
    const r=await fetch('https://abteeeen.github.io/next-chapter-jobs/jobs.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Feed unavailable');const data=await r.json();
    if (!Array.isArray(data.jobs) || !Array.isArray(data.sources) || !Number.isFinite(Date.parse(data.generated_at))) throw Error('Invalid feed');
    feed = data;
    jobs = data.jobs.filter(j => safeURL(j.url) && typeof j.title === 'string' && typeof j.company === 'string' && typeof j.location === 'string')
      .map(j => ({...j,url:safeURL(j.url)}));
    feedState = 'ready';
    const stale = Date.now() - Date.parse(data.generated_at) > 36 * 3600000;
    const warning = [stale && 'The feed is over 36 hours old. Check availability on the employer page.',data.errors?.length && 'Some employer boards could not refresh.'].filter(Boolean).join(' ');
    $('updated').textContent = `Updated ${date(data.generated_at)} IST`;
    $('feed-dot').dataset.state = warning ? 'warning' : 'ready';
    $('health').textContent = warning;
  } catch {
    feedState = 'error';
    $('updated').textContent = feed ? `Last update ${date(feed.generated_at)} IST` : 'Feed unavailable';
    $('feed-dot').dataset.state = 'warning';
    $('health').textContent = feed ? 'Refresh failed. Showing the last loaded listings.' : '';
  } finally {
    $('refresh').disabled = false;
    render();
  }
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
db.auth.onAuthStateChange((event,session)=>{
  const next = session?.user || null;
  const changed = next?.id !== user?.id || !authReady;
  if (changed) {
    authVersion++;
    tracked = new Map();
    trackerReady = false;
    trackerError = '';
    $('sync-status').textContent = next ? 'Loading your tracker…' : 'Sign in to sync across devices.';
  }
  user = next;
  authReady = true;
  if (changed) render();
  if (user && changed) {
    $('auth-dialog').close();
    setTimeout(syncTracker,0);
  }
  if (event === 'PASSWORD_RECOVERY') {
    $('auth-dialog').close();
    $('recovery-dialog').showModal();
  }
});
$('forgot').onclick=async()=>{if(!$('email').reportValidity())return;$('forgot').disabled=true;try{const {error}=await db.auth.resetPasswordForEmail($('email').value.trim(),{redirectTo:location.origin+location.pathname});if(error)throw error;$('auth-message').textContent='If an account exists, a password reset link will arrive by email.';}catch(e){$('auth-message').textContent=e.message;}finally{$('forgot').disabled=false;}};
$('recovery-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const {error}=await db.auth.updateUser({password:$('new-password').value});if(error)throw error;$('new-password').value='';$('recovery-dialog').close();notice('Password updated.');}catch(err){$('recovery-message').textContent=err.message;}finally{b.disabled=false;}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
for (const id of filterIds) $(id).addEventListener('input',() => {
  limit = pageSize;
  rememberFilters();
  render();
});
$('filters').onsubmit = e => e.preventDefault();
$('reset').onclick = resetFilters;
$('filter-toggle').onclick = () => {
  const options = $('filter-options');
  options.hidden = !options.hidden;
  $('filter-toggle').setAttribute('aria-expanded',String(!options.hidden));
};
$('more').onclick = () => {
  const previous = limit;
  limit += pageSize;
  render();
  $('cards').children[previous]?.querySelector('a')?.focus();
};
document.querySelector('.skip').onclick = e => { e.preventDefault(); $('main').focus(); };
document.querySelectorAll('[data-status]').forEach(button => {
  button.onclick = () => {
    const status = button.dataset.status;
    if (activeView !== 'tracker') {
      filterStates.tracker = {...filterDefaults,status};
      location.hash = 'tracker';
    } else {
      $('status').value = $('status').value === status ? '' : status;
      limit = pageSize;
      rememberFilters();
      render();
    }
  };
});
window.addEventListener('hashchange',() => {
  const next = view();
  if (next === activeView) return;
  rememberFilters();
  activeView = next;
  limit = pageSize;
  if (next !== 'sources') {
    refreshSourcesFilter(filterStates[next].source);
    setFilterValues(filterStates[next]);
    if ($('source').selectedIndex < 0) $('source').value = '';
  }
  render();
  $('main').focus();
  window.scrollTo(0,0);
});
window.addEventListener('focus',syncTracker);
setInterval(() => { if (!document.hidden) syncTracker(); },60000);
$('refresh').onclick=loadFeed;$('sync').onclick=syncTracker;$('add-job').onclick=()=>{if(requireUser())$('job-dialog').showModal();};
$('job-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await saveJob({url:$('job-url').value,title:$('job-title').value.trim(),company:$('job-company').value.trim(),location:$('job-location').value.trim(),source:'Added by you'});$('job-dialog').close();$('job-form').reset();notice('Job added to your private tracker.');}catch(err){$('job-message').textContent=err.message;}finally{b.disabled=false;}};
$('export').onclick=()=>{if(!requireUser())return;const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),jobs:[...tracked.values()].map(({user_id,...j})=>j)},null,2)],{type:'application/json'});const a=node('a');a.href=URL.createObjectURL(blob);a.download='next-chapter-tracker.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
render();loadFeed();
if(hasAuthLinkError)notice('This sign-in link was already used or has expired. If you are not already signed in, request a new email link.');
