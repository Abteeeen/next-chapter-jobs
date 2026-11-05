'use strict';
const $=id=>document.getElementById(id);let jobs=[],limit=25,saved=new Set();
try{saved=new Set(JSON.parse(localStorage.getItem('next-chapter-saved')||'[]'));}catch{}
const safeURL=u=>{try{const p=new URL(u);return p.protocol==='https:'&&!p.username&&!p.password?u:null;}catch{return null;}};
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
const date=s=>new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(s));
function render(){
 const query=$('query').value.toLowerCase().trim(),loc=$('location').value.toLowerCase(),track=$('track').value,source=$('source').value;
 const aliases={india:/india|coimbatore|kerala|kochi|bengaluru|bangalore|karnataka|mumbai|goa|chennai|hyderabad|noida|gurgaon|gurugram|delhi|pune|worldwide|anywhere/i,kerala:/kerala|kochi|cochin|ernakulam|thrissur|palakkad|trivandrum|thiruvananthapuram|kozhikode|calicut|kannur|kollam/i,bengaluru:/bengaluru|bangalore/i,karnataka:/karnataka|bengaluru|bangalore|mysore|mysuru|mangalore|mangaluru/i};
 let list=jobs.filter(j=>(!query||`${j.title} ${j.company} ${j.snippet}`.toLowerCase().includes(query))&&(!loc||(aliases[loc]?aliases[loc].test(j.location):j.location.toLowerCase().includes(loc)))&&(!track||j.track===track)&&(!source||j.source===source)&&(!$('junior').checked||j.early_career)&&(!$('saved').checked||saved.has(j.url)));
 list.sort((a,b)=>$('sort').value==='checked'?b.checked_at.localeCompare(a.checked_at):a[$('sort').value].localeCompare(b[$('sort').value]));
 $('count').textContent=`${list.length} opportunities`;const root=$('cards');root.replaceChildren();
 for(const j of list.slice(0,limit)){
  const c=node('article',null,'card');c.append(node('div',j.company.slice(0,2).toUpperCase(),'logo'));const body=node('div');body.append(node('h3',j.title),node('p',`${j.company} · ${j.location}`,'company'));
  const tags=node('div',null,'tags');for(const t of [j.track,j.source,j.experience_required==null?'Experience unspecified — check listing':`${j.experience_required}+ years requested`])tags.append(node('span',t,'tag'));body.append(tags,node('p',j.snippet,'snippet'));
  const actions=node('div',null,'actions'),a=node('a','View job & apply ↗','apply');a.href=safeURL(j.url);a.target='_blank';a.rel='noopener noreferrer';const s=node('button',saved.has(j.url)?'Saved':'Save job','save');s.type='button';s.setAttribute('aria-pressed',String(saved.has(j.url)));s.setAttribute('aria-label',`${saved.has(j.url)?'Unsave':'Save'} ${j.title} at ${j.company}`);s.onclick=()=>{saved.has(j.url)?saved.delete(j.url):saved.add(j.url);try{localStorage.setItem('next-chapter-saved',JSON.stringify([...saved]));}catch{}render();};actions.append(a,s);body.append(actions,node('div',`Source checked ${date(j.checked_at)} IST · Listing availability can change`,'meta'));c.append(body);root.append(c);
 }
 if(!list.length){const e=node('div',null,'empty');e.append(node('h3','No jobs match these filters.'),node('p','Try another location or role, or open your search on LinkedIn and Naukri.'));root.append(e);}
 $('more').hidden=list.length<=limit;
 const term=$('query').value.trim()||'Data Analyst';$('linkedin').href=`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(term)}&location=${encodeURIComponent($('location').value||'India')}&f_TPR=r86400`;
 $('naukri').href=`https://www.naukri.com/${encodeURIComponent(term.toLowerCase().replace(/[^a-z0-9]+/g,'-'))}-jobs${loc?'-in-'+encodeURIComponent(loc):''}`;
}
for(const id of ['query','location','track','source','junior','saved','sort'])$(id).addEventListener('input',()=>{limit=25;render();});$('filters').onsubmit=e=>e.preventDefault();$('more').onclick=()=>{limit+=25;render();};$('reset').onclick=()=>{$('filters').reset();limit=25;render();};
fetch('./jobs.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('feed');return r.json();}).then(data=>{jobs=data.jobs.filter(j=>safeURL(j.url));$('updated').textContent=`Updated ${date(data.generated_at)} IST`;$('health').textContent=`${data.scanned} public vacancies checked across ${data.sources.length} employer boards.${data.errors.length?' Some sources could not refresh; see listing timestamps.':''}${Date.now()-Date.parse(data.generated_at)>36*3600000?' This feed is over 36 hours old; check original listings.':''}`;render();}).catch(()=>{$('updated').textContent='Latest feed unavailable';$('count').textContent='Could not load jobs';$('health').textContent='Please refresh later. You can still use the LinkedIn and Naukri search links.';});
