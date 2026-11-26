const $=s=>document.querySelector(s),pad=n=>String(n).padStart(2,'0'),date=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,parse=s=>new Date(s+'T12:00:00'),shift=(s,n)=>{let d=parse(s);d.setDate(d.getDate()+n);return date(d)},esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='geumsan-planner-v1',subjects=['국어','수학','사회','과학','체육','음악','미술','영어','창의적 체험활동','학교자율시간'];
function defaults(y){return {year:y,school:'금산초등학교',semester:`${y}-08-24`,events:[{id:'sample1',name:'여름방학 (예시)',type:'break',start:`${y}-07-24`,end:`${y}-08-23`,grade:'all'},{id:'sample2',name:'겨울방학 (예시)',type:'break',start:`${y+1}-01-09`,end:`${y+1}-02-28`,grade:'all'},{id:'sample3',name:'현장체험학습 (예시)',type:'trip',start:`${y}-05-12`,end:`${y}-05-12`,grade:'all'}],hours:{},plans:{},revision:0}}
let db;try{db=JSON.parse(localStorage.getItem(KEY))}catch{}if(!db||!db.years)db={years:{2026:defaults(2026)},current:2026};let state=db.years[db.current],month=state.year*12+2,annual=false,editing=null,history=[],selection=null,selectionGesture=null,dragId=null;
function toast(t){$('#toast').textContent=t;$('#toast').classList.remove('hidden');setTimeout(()=>$('#toast').classList.add('hidden'),2600)}
function checkpoint(){history.push(JSON.stringify(db));if(history.length>30)history.shift()}
function save(revise=true){if(revise)state.revision++;db.years[state.year]=state;try{localStorage.setItem(KEY,JSON.stringify(db));$('#saved').textContent='✓ 이 브라우저에 저장됨'}catch{toast('저장 공간이 부족합니다. 백업 파일을 저장하세요.')}render()}
function bounds(){return [state.year+'-03-01',date(new Date(state.year+1,2,0,12))]}
function days(){let [a,b]=bounds(),out=[];for(let s=a;s<=b;s=shift(s,1))out.push(s);return out}
function applicable(e,g){return g==='all'?e.grade==='all':e.grade==='all'||e.grade===g}
const CLOUD = 'https://nnnocqwdkgeqybfjrigo.supabase.co';
const PUBLIC_KEY = 'sb_publishable_f6B43Lp2zrOgzHwWJ4IjOg_ZaHmAfHf';
const shared = new Map();
let token = '', busy = false, readId = 0;
const schedulePath = year => '/rest/v1/planner_schedules?school_year=eq.' + year;
const eventsForYear = () => shared.get(state.year)?.events ?? [];
const editable = () => !!token && !busy && shared.has(state.year);

async function request(path, {method = 'GET', body, auth = '', returning = false} = {}) {
  const headers = {apikey: PUBLIC_KEY};
  if (auth) headers.Authorization = 'Bearer ' + auth;
  if (body) headers['Content-Type'] = 'application/json';
  if (returning) headers.Prefer = 'return=representation';
  const res = await fetch(CLOUD + path, {
    method, headers, cache: 'no-store', body: body && JSON.stringify(body)
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function updateCloudControls() {
  for (const selector of ['#school', '#semester', '#undo']) $(selector).disabled = !token;
  $('#add').disabled = !editable();
  $('#cloudImport').hidden = !token;
  $('#cloudImport').disabled = !editable();
  $('#cloudLogin').textContent = token ? '로그아웃' : '편집자 로그인';
  $('#cloudStatus').textContent = busy ? '공유 일정 저장 중' : !shared.has(state.year) ?
    '공유 일정 불러오는 중' : token ? '공유 일정 편집 가능' : '공유 일정 보기 전용';
}
async function readSchedule() {
  const year = state.year, id = ++readId;
  updateCloudControls();
  try {
    const [row] = await request(schedulePath(year) + '&select=events');
    if (id !== readId || year !== state.year) return;
    shared.set(year, {exists: !!row, events: row?.events ?? []});
    render();
  } catch {
    if (id === readId) $('#cloudStatus').textContent = '공유 일정 불러오기 실패. 새로고침해 주세요.';
  }
}
async function writeSchedule(events, message) {
  if (!editable()) return;
  const year = state.year, snapshot = shared.get(year);
  busy = true;
  ++readId;
  updateCloudControls();
  try {
    // Compare the stored snapshot to avoid losing concurrent edits.
    const [row] = snapshot.exists
      ? await request(schedulePath(year) + '&events=eq.' + encodeURIComponent(JSON.stringify(snapshot.events)), {
          method: 'PATCH', auth: token, body: {events}, returning: true
        })
      : await request('/rest/v1/planner_schedules', {
          method: 'POST', auth: token, body: {school_year: year, events}, returning: true
        });
    if (!row) throw new Error('409');
    shared.set(year, {exists: true, events: row.events});
    if (state.year === year) { state.revision++; save(false); }
    toast(message);
    return true;
  } catch (error) {
    if (error.message === '401') token = '';
    toast(error.message === '409' ? '다른 편집자의 변경을 불러왔습니다. 확인 후 다시 편집하세요.' :
      '공유 일정 저장에 실패했습니다. 연결과 편집 권한을 확인하세요.');
    return false;
  } finally {
    busy = false;
    // The write response already contains the authoritative schedule.
    // Refresh only after a failure or if the user navigated to a different year.
    if (state.year !== year || shared.get(year) === snapshot) await readSchedule();
    else render();
  }
}

$('#cloudLogin').onclick = () => {
  if (token) { token = ''; render(); return; }
  $('#cloudForm').reset();
  $('#cloudDialog').showModal();
};
$('#cloudCancel').onclick = () => $('#cloudDialog').close();
$('#cloudForm').onsubmit = async event => {
  event.preventDefault();
  const submit = $('#cloudSubmit');
  submit.disabled = true;
  try {
    const session = await request('/auth/v1/token?grant_type=password', {
      method: 'POST', body: {email: $('#cloudEmail').value.trim(), password: $('#cloudPassword').value}
    });
    const editors = await request('/rest/v1/planner_editors?select=user_id', {auth: session.access_token});
    if (!editors.some(editor => editor.user_id === session.user.id)) {
      $('#cloudError').textContent = '이 계정에는 편집 권한이 없습니다.';
      return;
    }
    token = session.access_token;
    $('#cloudDialog').close();
    await readSchedule();
  } catch {
    $('#cloudError').textContent = '로그인하지 못했습니다. 이메일과 비밀번호를 확인하세요.';
  } finally {
    $('#cloudPassword').value = '';
    submit.disabled = false;
  }
};
$('#cloudDialog').addEventListener('close', () => { $('#cloudError').textContent = ''; });
$('#cloudImport').onclick = () => {
  if (!editable()) return;
  const existing = eventsForYear(), ids = new Set(existing.map(event => event.id));
  const additions = state.events.filter(event => !ids.has(event.id) && !/^sample[123]$/.test(event.id));
  if (!additions.length) return toast('추가할 이 브라우저 일정이 없습니다.');
  if (confirm(state.year + '학년도 일정 ' + additions.length + '건을 공개 달력에 올릴까요?')) {
    writeSchedule([...existing, ...additions], '기존 일정을 공개 달력에 추가했습니다.');
  }
};
window.addEventListener('focus', () => {
  if (!busy && !$('#editor').open && !$('#cloudDialog').open) readSchedule();
});

function allEvents(){let official=academicPublicHolidays(state.year);return [...official,...eventsForYear().filter(e=>!official.some(h=>e.type==='holiday'&&e.start===h.start&&e.end===h.end&&e.name===h.name))]}
function eventsOn(s,g){return allEvents().filter(e=>e.start<=s&&e.end>=s&&applicable(e,g))}
function teaching(s,g){let ev=eventsOn(s,g);if(ev.some(e=>['off','break','holiday'].includes(e.type)))return false;let w=parse(s).getDay();return (w>0&&w<6)||ev.some(e=>e.type==='school')}
function summary(g){let all=days(),open=all.filter(s=>teaching(s,g)),week=Array(7).fill(0);open.forEach(s=>week[parse(s).getDay()]++);return {all,open,week,first:open.filter(s=>s<state.semester).length,second:open.filter(s=>s>=state.semester).length}}
function render(){updateCloudControls();let g=$('#grade').value||'all',s=summary(g);$('#stats').innerHTML=[['연간 수업일수',s.open.length+'일'],['1학기 / 2학기',s.first+' / '+s.second+'일'],['휴업일수',s.all.length-s.open.length+'일'],['등록된 일정',eventsForYear().length+'건']].map(([a,b])=>`<div class="stat"><small>${a}</small><b>${b}</b></div>`).join('');$('#school').value=state.school;$('#semester').value=state.semester;renderCalendar();$('#weekStats').innerHTML=['일','월','화','수','목','금','토'].map((v,i)=>`<div style="display:flex;justify-content:space-between;padding:5px"><span>${v}요일</span><b>${s.week[i]}일</b></div>`).join('');renderHours();renderPlan()}
function calendarHTML(y,m,mini=false){let first=new Date(y,m,1,12),start=new Date(y,m,1-first.getDay(),12),count=Math.ceil((first.getDay()+new Date(y,m+1,0).getDate())/7)*7,g=$('#grade').value;let html='<div class="grid">'+['일','월','화','수','목','금','토'].map(x=>`<div class="weekday">${x}</div>`).join('');for(let i=0;i<count;i++){let d=new Date(start);d.setDate(start.getDate()+i);let s=date(d),inside=d.getMonth()===m,ev=allEvents().filter(e=>e.start<=s&&e.end>=s&&(g==='all'||applicable(e,g)));html+=`<div class="day ${inside?'':'out'} ${[0,6].includes(d.getDay())?'weekend':''} ${teaching(s,g)?'':'closed'} ${ev.some(e=>e.type==='holiday')?'public-holiday':''}" data-date="${s}" title="${esc(ev.map(e=>e.name).join(' · '))}"><span class="number">${d.getDate()}</span>${ev.map(e=>`<span class="chip ${e.type}" data-id="${esc(e.id)}" draggable="${editable()&&e.type!=='holiday'&&!e.official}" title="${esc(e.name)}">${e.type==='holiday'?'🔒 ':''}${esc(e.name)}${e.grade==='all'?'':' · '+e.grade+'학년'}</span>`).join('')}</div>`}return html+'</div>'}
function renderCalendar(){selection=null;selectionGesture=null;let y=Math.floor(month/12),m=month%12;$('#monthTitle').textContent=annual?state.year+'학년도':`${y}년 ${m+1}월`;$('#view').textContent=annual?'월별 보기':'학년도 전체 보기';$('#calendarGrid').innerHTML=annual?'<div class="annual">'+Array.from({length:12},(_,i)=>{let n=state.year*12+2+i;return `<div class="mini" data-month="${n}"><h3>${Math.floor(n/12)}년 ${n%12+1}월</h3>${calendarHTML(Math.floor(n/12),n%12,true)}</div>`}).join('')+'</div>':calendarHTML(y,m);let ev=allEvents().filter(e=>annual||(e.start<=date(new Date(y,m+1,0,12))&&e.end>=date(new Date(y,m,1,12)))).filter(e=>$('#grade').value==='all'||applicable(e,$('#grade').value)).sort((a,b)=>a.start.localeCompare(b.start));$('#eventList').innerHTML=ev.length?ev.map(e=>`<div class="listitem" data-id="${esc(e.id)}">${e.official||!editable()?'':'<button type="button" class="event-delete" data-delete>삭제</button>'}<b>${e.official?'🔒 ':''}${esc(e.name)}</b><small>${e.start.slice(5)}${e.start===e.end?'':' ~ '+e.end.slice(5)} · ${e.grade==='all'?'전체':e.grade+'학년'}</small></div>`).join(''):'<p class="muted">등록된 일정이 없습니다.</p>'}
function edit(id,start,end){if(!editable())return;if(allEvents().some(e=>e.id===id&&e.official)){toast('자동 반영된 공휴일입니다. 날짜 변경·삭제는 잠겨 있습니다.');return}editing=id;let e=eventsForYear().find(e=>e.id===id);$('#editorTitle').textContent=e?'일정 수정':'일정 등록';$('#name').value=e?.name||'';$('#type').value=e?.type||'event';$('#start').value=e?.start||start;$('#end').value=e?.end||end||start;$('#eventGrade').value=e?.grade||$('#grade').value;$('#delete').classList.toggle('hidden',!e);$('#editor').showModal()}
$('#calendarGrid').addEventListener('click',e=>{if(annual){let mini=e.target.closest('.mini');if(mini){month=+mini.dataset.month;annual=false;renderCalendar()}return}let chip=e.target.closest('[data-id]');if(chip)edit(chip.dataset.id);});
const calendarGrid = $('#calendarGrid');
function showSelection(range) {
  const dates = range ? [range.start, range.end].sort() : [];
  calendarGrid.querySelectorAll('[data-date]').forEach(cell => {
    const day = cell.dataset.date;
    cell.classList.toggle('selected', !!range && day >= dates[0] && day <= dates[1]);
  });
}
calendarGrid.addEventListener('pointerdown', event => {
  if (!editable() || annual || selectionGesture || event.target.closest('[data-id]') || event.button !== 0) return;
  const cell = event.target.closest('[data-date]');
  if (!cell) return;
  const day = cell.dataset.date;
  selectionGesture = {
    pointerId: event.pointerId,
    start: day,
    end: day,
    wasSelected: cell.classList.contains('selected'),
    moved: false
  };
  if (!selectionGesture.wasSelected) showSelection(selectionGesture);
});
document.addEventListener('pointermove', event => {
  if (selectionGesture?.pointerId !== event.pointerId) return;
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-date]');
  if (!cell || !calendarGrid.contains(cell) || cell.dataset.date === selectionGesture.end) return;
  selectionGesture.end = cell.dataset.date;
  selectionGesture.moved = true;
  showSelection(selectionGesture);
});
document.addEventListener('pointerup', event => {
  if (selectionGesture?.pointerId !== event.pointerId) return;
  const { start, end, wasSelected, moved } = selectionGesture;
  selectionGesture = null;
  selection = !moved && wasSelected ? null : { start, end };
  showSelection(selection);
});
document.addEventListener('pointercancel', event => {
  if (selectionGesture?.pointerId !== event.pointerId) return;
  selectionGesture = null;
  showSelection(selection);
});
$('#calendarGrid').addEventListener('dragstart',e=>{let chip=e.target.closest('[data-id]');if(chip){dragId=chip.dataset.id;e.dataTransfer.setData('text/plain',dragId)}});
$('#calendarGrid').addEventListener('dragover',e=>{if(!annual)e.preventDefault()});
$('#calendarGrid').addEventListener('drop',e=>{e.preventDefault();let cell=e.target.closest('[data-date]'),ev=eventsForYear().find(x=>x.id===e.dataTransfer.getData('text/plain'));if(!editable()||!cell||!ev||ev.type==='holiday')return;let delta=Math.round((parse(cell.dataset.date)-parse(ev.start))/86400000),newEnd=shift(ev.end,delta),[a,b]=bounds();if(cell.dataset.date<a||newEnd>b)return toast('학년도 범위 안으로 이동하세요.');writeSchedule(eventsForYear().map(item=>item.id===ev.id?{...item,start:cell.dataset.date,end:newEnd}:item),'일정을 이동했습니다.')});
$('#eventList').onclick = event => {
  const row = event.target.closest('[data-id]');
  if (!row) return;
  if (event.target.closest('[data-delete]')) {
    const item = eventsForYear().find(item => item.id === row.dataset.id);
    if (item && confirm(`‘${item.name}’ 일정을 삭제할까요?`)) deleteEvent(item.id);
    return;
  }
  edit(row.dataset.id);
};
$('#eventForm').onsubmit=e=>{e.preventDefault();if(!editable())return;let start=$('#start').value,end=$('#end').value,[a,b]=bounds();if(start>end||start<a||end>b)return toast('학년도 안의 올바른 기간을 선택하세요.');let item={id:editing||crypto.randomUUID(),name:$('#name').value.trim(),type:$('#type').value,start,end,grade:$('#eventGrade').value};if(!item.name)return;const events=eventsForYear();if(editing&&!events.some(x=>x.id===editing))return;$('#editor').close();writeSchedule(editing?events.map(x=>x.id===editing?item:x):[...events,item],'공유 일정을 저장했습니다.')};
async function deleteEvent(id) {
  const events = eventsForYear();
  if (!editable() || !events.some(item => item.id === id)) return;
  const dialog = $('#editor');
  const fromDialog = dialog.open;
  if (fromDialog) dialog.close();
  const saved = await writeSchedule(events.filter(item => item.id !== id), '공유 일정을 삭제했습니다.');
  if (!saved && fromDialog && editable() && eventsForYear().some(item => item.id === id)) {
    edit(id);
    $('#editorTitle').textContent = '일정 수정 · 삭제 실패';
  }
}
$('#delete').onclick = () => deleteEvent(editing);
$('#add').onclick = () => {
  if (selection) {
    const dates = [selection.start, selection.end].sort();
    edit(null, ...dates);
    return;
  }
  edit(null, `${Math.floor(month / 12)}-${pad(month % 12 + 1)}-01`);
};
$('#prev').onclick=()=>{month=Math.max(state.year*12+2,month-1);renderCalendar()};$('#next').onclick=()=>{month=Math.min(state.year*12+13,month+1);renderCalendar()};$('#view').onclick=()=>{annual=!annual;renderCalendar()};$('#grade').onchange=render;
for(let y=2025;y<=2035;y++)$('#year').add(new Option(y+'학년도',y));$('#year').value=state.year;['grade','eventGrade','hourGrade','planGrade'].forEach(id=>{for(let g=1;g<=6;g++)$('#'+id).add(new Option(g+'학년',String(g)))});
$('#year').onchange=()=>{checkpoint();db.current=+$('#year').value;state=db.years[db.current]||defaults(db.current);month=state.year*12+2;save(false);readSchedule()};$('#school').onchange=()=>{if(!token){$('#school').value=state.school;return;}checkpoint();state.school=$('#school').value;save(false)};$('#semester').onchange=()=>{if(!token){$('#semester').value=state.semester;return;}let v=$('#semester').value,[a,b]=bounds();if(v<a||v>b){$('#semester').value=state.semester;return toast('학년도 안의 날짜를 선택하세요.')}checkpoint();state.semester=v;save()};
$('#undo').onclick=()=>{if(!token)return;if(!history.length)return toast('취소할 변경이 없습니다.');db=JSON.parse(history.pop());state=db.years[db.current];$('#year').value=state.year;month=Math.min(Math.max(month,state.year*12+2),state.year*12+13);save(false);readSchedule();toast('이전 상태로 복구했습니다.')};
function download(name,text,type){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#backup').onclick=()=>download('교육과정-백업-'+date(new Date())+'.json',JSON.stringify(db,null,2),'application/json');$('#restore').onclick=()=>$('#file').click();
function validateDb(x){if(!x||!x.years||!x.years[x.current])throw Error();for(let [y,s]of Object.entries(x.years)){if(!Number.isInteger(+y)||+y<2025||+y>2035||s.year!==+y||!Array.isArray(s.events)||typeof s.school!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.semester)||!s.hours||!s.plans)throw Error();let a=y+'-03-01',b=date(new Date(+y+1,2,0,12));if(s.semester<a||s.semester>b)throw Error();for(let e of s.events){if(typeof e.id!=='string'||typeof e.name!=='string'||!['event','trip','off','break','holiday','school'].includes(e.type)||!['all','1','2','3','4','5','6'].includes(e.grade)||![e.start,e.end].every(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&date(parse(v))===v)||e.start<a||e.end>b||e.start>e.end)throw Error()}for(let rows of Object.values(s.hours)){if(!Array.isArray(rows)||rows.some(r=>typeof r.name!=='string'||!Number.isFinite(r.target)||r.target<0||!Array.isArray(r.week)||r.week.length!==7||r.week.some(v=>!Number.isInteger(v)||v<0||v>10)))throw Error()}for(let p of Object.values(s.plans)){if(!Array.isArray(p.rows)||p.rows.some(r=>typeof r.date!=='string'||typeof r.subject!=='string'||typeof r.unit!=='string'||typeof r.lesson!=='number'))throw Error()}}return x}
$('#file').onchange=async()=>{try{let x=validateDb(JSON.parse(await $('#file').files[0].text()));checkpoint();db=x;state=db.years[db.current];$('#year').value=state.year;month=state.year*12+2;save(false);readSchedule();toast('백업을 불러왔습니다.')}catch{toast('올바른 교육과정 백업 파일이 아닙니다.')}$('#file').value=''};
function rows(g){return state.hours[g]||(state.hours[g]=subjects.map(name=>({name,target:0,week:Array(7).fill(0)})))}
function renderHours(){let g=$('#hourGrade').value||'1',s=summary(g);$('#hoursTable').innerHTML='<tr><th>교과</th><th>목표 시수</th>'+['월','화','수','목','금','토','일'].map(x=>'<th>'+x+'</th>').join('')+'<th>편성 시수</th><th>차이</th></tr>'+rows(g).map((r,i)=>{let total=r.week.reduce((v,n,d)=>v+n*s.week[d],0);return `<tr data-row="${i}"><td><input data-field="name" value="${esc(r.name)}" style="width:150px"></td><td><input type="number" min="0" max="3000" data-field="target" value="${r.target}"></td>${[1,2,3,4,5,6,0].map(d=>`<td><input type="number" min="0" max="10" step="1" data-day="${d}" value="${r.week[d]}"></td>`).join('')}<td><b>${total}</b></td><td style="color:${total<r.target?'#b35645':'#287657'}">${total-r.target}</td></tr>`}).join('')}
$('#hourGrade').onchange=renderHours;$('#hoursTable').onchange=e=>{let el=e.target,i=+el.closest('[data-row]').dataset.row,r=rows($('#hourGrade').value)[i];if(el.type==='number'&&(!el.checkValidity()||!Number.isInteger(+el.value)))return renderHours();checkpoint();if(el.dataset.day!==undefined)r.week[+el.dataset.day]=+el.value;else r[el.dataset.field]=el.type==='number'?+el.value:el.value;save()};$('#subjectAdd').onclick=()=>{checkpoint();rows($('#hourGrade').value).push({name:'새 교과',target:0,week:Array(7).fill(0)});save()};
$('#generate').onclick=()=>{let g=$('#planGrade').value,out=[],counts={};for(let d of summary(g).open){for(let r of rows(g)){for(let i=0;i<r.week[parse(d).getDay()];i++){counts[r.name]=(counts[r.name]||0)+1;out.push({date:d,subject:r.name,lesson:counts[r.name],unit:''})}}}if(!out.length)return toast('시수 배정에서 요일별 수업 시수를 먼저 입력하세요.');let old=state.plans[g];if(old?.rows.some(r=>r.unit)&&!confirm('기존 단원·활동 입력을 포함한 초안을 교체합니다. 백업 후 진행하세요.'))return;checkpoint();state.plans[g]={revision:state.revision,holidayVersion:HOLIDAY_VERSION,rows:out};save(false);toast(out.length+'차시의 초안을 생성했습니다.')};
function renderPlan(){let p=state.plans[$('#planGrade').value];$('#planStatus').textContent=p?(p.revision===state.revision&&p.holidayVersion===HOLIDAY_VERSION?'현재 일정 기준':'⚠ 일정·시간표 변경됨: 초안 재검토 필요'):'';$('#planTable').innerHTML='<tr><th>날짜</th><th>교과</th><th>차시</th><th>단원 / 활동</th></tr>'+(p?p.rows.map((r,i)=>`<tr><td><input type="date" data-index="${i}" data-field="date" value="${esc(r.date)}" style="width:145px"></td><td>${esc(r.subject)}</td><td>${r.lesson}</td><td><input data-index="${i}" data-field="unit" value="${esc(r.unit)}" placeholder="단원·활동 입력" style="width:100%;min-width:220px"></td></tr>`).join(''):'<tr><td colspan="4">요일별 시수를 입력한 뒤 초안을 생성하세요.</td></tr>')}
$('#planGrade').onchange=renderPlan;$('#planTable').onchange=e=>{let el=e.target,g=$('#planGrade').value;if(el.dataset.index===undefined)return;if(el.dataset.field==='date'){let [a,b]=bounds();if(el.value<a||el.value>b||!teaching(el.value,g)){toast('해당 학년의 수업일로 배정하세요.');return renderPlan()}}checkpoint();state.plans[g].rows[+el.dataset.index][el.dataset.field]=el.value;save(false)};
$('#csv').onclick=()=>{let g=$('#planGrade').value,p=state.plans[g];if(!p)return toast('초안을 먼저 생성하세요.');let q=s=>'"'+String(s).replace(/"/g,'""')+'"';download(`${state.year}-${g}학년-연간편성.csv`,'\uFEFF'+[['날짜','교과','차시','단원/활동'],...p.rows.map(r=>[r.date,r.subject,r.lesson,r.unit])].map(r=>r.map(q).join(',')).join('\r\n'),'text/csv;charset=utf-8')};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));['calendar','hours','plan'].forEach(id=>$('#'+id).classList.toggle('hidden',id!==b.dataset.tab))});render();

readSchedule();
