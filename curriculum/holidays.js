/* Korean public holidays. Rules verified 2026-11-16 against law.go.kr.
   2025–2028 lunar dates cross-checked with KASI calendar data.
   Later lunar dates precomputed using ICU's Korean (dangi) calendar;
   later years are projections under current law, not official annual announcements. */
const HOLIDAY_VERSION='kr-2026-11-16-v1';
const KR_LUNAR_DATES={
2025:['01-29','05-05','10-06'],2026:['02-17','05-24','09-25'],
2027:['02-07','05-13','09-15'],2028:['01-27','05-02','10-03'],
2029:['02-13','05-20','09-22'],2030:['02-03','05-09','09-12'],
2031:['01-23','05-28','10-01'],2032:['02-11','05-16','09-19'],
2033:['01-31','05-06','09-08'],2034:['02-19','05-25','09-27'],
2035:['02-08','05-15','09-16'],2036:['01-28','05-03','10-04']};
const KR_SPECIAL_DAYS={2025:[['01-27','임시공휴일'],['06-03','대통령선거일 (임시공휴일)']],2026:[['06-03','전국동시지방선거일']],2028:[['04-12','국회의원선거일']]};
const krHolidayCache=new Map();
function publicHolidays(year){
 if(krHolidayCache.has(year))return krHolidayCache.get(year);
 const lunar=KR_LUNAR_DATES[year];if(!lunar)return [];
 const day=s=>new Date(s+'T12:00:00Z').getUTCDay();
 const move=(s,n)=>{let d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 let groups=[];
 const add=(name,dates,rule='weekend')=>groups.push({name,dates,rule});
 for(let [md,name,rule]of [['01-01','신정','none'],['03-01','삼일절','weekend'],['05-05','어린이날','weekend'],['06-06','현충일','none'],['08-15','광복절','weekend'],['10-03','개천절','weekend'],['10-09','한글날','weekend'],['12-25','성탄절','weekend']])add(name,[`${year}-${md}`],rule);
 if(year>=2026){add('노동절',[`${year}-05-01`]);add('제헌절',[`${year}-07-17`]);}
 const [newYear,buddha,chuseok]=lunar.map(md=>`${year}-${md}`);
 add('설날',[move(newYear,-1),newYear,move(newYear,1)],'sunday');
 add('부처님오신날',[buddha]);
 add('추석',[move(chuseok,-1),chuseok,move(chuseok,1)],'sunday');
 let base=groups.flatMap(g=>g.dates.map(s=>({date:s,name:g.name,group:g}))),occupied=new Set(base.map(x=>x.date));
 let reasons=new Map();
 for(let g of groups){if(g.rule==='none')continue;for(let s of g.dates){let w=day(s),overlap=w>0&&w<6&&base.some(b=>b.date===s&&b.group!==g);if(w===0||(g.rule==='weekend'&&w===6)||overlap){if(!reasons.has(s))reasons.set(s,new Set());reasons.get(s).add(g.name)}}}
 const special=(KR_SPECIAL_DAYS[year]||[]).map(([md,name])=>({date:`${year}-${md}`,name}));special.forEach(x=>occupied.add(x.date));
 let subs=[];
 for(let [s,names]of [...reasons].sort(([a],[b])=>a.localeCompare(b))){let next=move(s,1);while([0,6].includes(day(next))||occupied.has(next))next=move(next,1);occupied.add(next);subs.push({date:next,name:`대체공휴일 (${[...names].join('·')})`})}
 const result=[...base,...subs,...special].map((h,i)=>({id:`kr-holiday-${year}-${h.date}-${i}`,name:h.name,start:h.date,end:h.date,type:'holiday',grade:'all',official:true})).sort((a,b)=>a.start.localeCompare(b.start)||a.name.localeCompare(b.name));krHolidayCache.set(year,result);return result;
}
function academicPublicHolidays(year){const start=`${year}-03-01`,end=`${year+1}-02-29`;return [...publicHolidays(year),...publicHolidays(year+1)].filter(e=>e.start>=start&&e.start<=end)}
