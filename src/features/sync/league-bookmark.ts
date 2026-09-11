/**
 * The leagues this directory follows week by week, and one bookmark that
 * collects all of them.
 *
 * Two platforms, one habit. The ECNL leagues are on AthleteOne, whose API
 * answers the person's own browser and nobody else; WPL and the Girls Academy
 * are on GotSport, which refuses everything but a browser (robots.txt is a
 * bare Disallow, and a request without their cookie is sent to a captcha).
 * Both publish a whole season at once and fill the scores in as games are
 * played, so reading them is a weekly habit rather than an import — and a
 * habit survives on how little it costs. The owner's rule: one bookmark, one
 * click, one file, one command. Not a second flow for the second platform.
 *
 * The bookmark is the whole tool rather than a loader, unlike the copier.
 * That one outgrew a bookmark at ten kilobytes; this fits — and carrying it
 * inline means there is no address to serve, nothing for a page's content
 * policy to refuse, and no secret to keep.
 *
 * Where to click it: twice a week, once on each site. GotSport pages can
 * only be read from their own origin, and AthleteOne's API answers only the
 * pages on theecnl.com — its CORS header names that origin and no other,
 * which a click on GotSport found out the hard way. So the bookmark reads
 * whatever the site it is on allows, names the file after it, and says
 * which leagues want the other site. One league failing does not stop the
 * rest; its line says what happened.
 */

export type League =
  | {
      platform: "athleteone";
      /** What the bundle labels its fragments with, and what --league matches. */
      name: string;
      /** AthleteOne's own three ids. Read off the page; see the skill. */
      org: number;
      season: number;
      event: number;
      /** The event these fixtures belong to here. */
      eventSlug: string;
    }
  | {
      platform: "gotsport";
      name: string;
      /** The number in system.gotsport.com/org_event/events/<event>. */
      event: number;
      /**
       * Which of the event's groups to take, as a pattern on the group's
       * name. The GA's league events are national and list every conference;
       * only the Northwest is ours. Absent, every group is taken.
       */
      only?: string;
      eventSlug: string;
    };

/** Kept for the callers that only ever knew the ECNL shape. */
export type EcnlLeague = Extract<League, { platform: "athleteone" }>;

/**
 * As of the 2026-27 season.
 *
 * These change when the season does, and the failure is loud rather than
 * quiet: a stale event id returns an empty division list, and the bookmark
 * says which league it happened to instead of writing a file with a hole in
 * it. The skill has the three lines that read the new ones off the page.
 */
export const LEAGUES: League[] = [
  { platform: "athleteone", name: "ECNL Boys", org: 12, season: 81, event: 4284, eventSlug: "ecnl-league-northwest-conference" },
  { platform: "athleteone", name: "ECNL Girls", org: 9, season: 80, event: 4268, eventSlug: "ecnl-league-northwest-conference" },
  { platform: "athleteone", name: "ECNL RL Boys", org: 16, season: 83, event: 4353, eventSlug: "ecnl-rl-league-northwest-conference" },
  { platform: "athleteone", name: "ECNL RL Girls", org: 13, season: 82, event: 4311, eventSlug: "ecnl-rl-league-northwest-conference" },
  { platform: "athleteone", name: "Pre-ECNL Boys", org: 22, season: 87, event: 4385, eventSlug: "pre-ecnl-league-northwest-conference" },
  { platform: "athleteone", name: "Pre-ECNL Girls", org: 21, season: 86, event: 4384, eventSlug: "pre-ecnl-league-northwest-conference" },
  /*
   * GotSport, from 2026-09-11. The event numbers are the ones wpl-soccer.com
   * and girlsacademyleague.com link to; the others on those pages (Boys HS,
   * N1, NSRL, the dev leagues, GA Inspire) wait until the owner asks.
   *
   * The GA lists two conferences whose names both end in Northwest —
   * "Northwest U13" and "Pacific-Northwest U13" — and ours is the Pacific
   * one. A pattern of "Northwest" alone took both, twelve groups for six.
   */
  { platform: "gotsport", name: "WPL U11-U14 Fall", event: 55357, eventSlug: "wpl-fall-2026-u11-u14" },
  { platform: "gotsport", name: "GA League", event: 56497, only: "Pac(ific)?[- ]?Northwest", eventSlug: "ga-league-2026-27-northwest" },
  { platform: "gotsport", name: "GA ASPIRE", event: 56498, only: "Pac(ific)?[- ]?Northwest", eventSlug: "ga-aspire-2026-27-northwest" },
];

export const ECNL_LEAGUES: EcnlLeague[] = LEAGUES.filter(
  (l): l is EcnlLeague => l.platform === "athleteone",
);

/**
 * What the bookmark runs, before the league table is substituted in.
 *
 * Every line break stays — collapsing them is what broke the copier's first
 * version, where a trailing comment swallowed the statement after it. There
 * are no comments in here for the same reason.
 *
 * The pause between requests is not asked for by anybody and costs nothing.
 */
const SOURCE = `
(function(){
var API='https://api.athleteone.com/api/Script';
var GS='system.gotsport.com',ECNL='theecnl.com';
var LEAGUES=__LEAGUES__;
var here=location.host===GS?'gotsport':location.host.indexOf(ECNL)>=0?'athleteone':null;
function opts(html){
var d=new DOMParser().parseFromString(html,'text/html');
return [].slice.call(d.querySelectorAll('option')).filter(function(o){return o.value!=='0';})
.map(function(o){return [o.textContent.trim(),o.value];});
}
function note(msg){
var el=document.getElementById('kjs-league-note');
if(!el){el=document.createElement('div');el.id='kjs-league-note';
el.style.cssText='position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;padding:12px 14px;background:#221c14;color:#c58a24;font:13px system-ui;border-radius:8px;white-space:pre-line';
document.body.appendChild(el);}
el.textContent=msg;
return el;
}
var out={},done=0,total=0,lines=[];
function pause(){return new Promise(function(res){setTimeout(res,2500);});}
async function readGotSport(L){
var fr=await fetch('/org_event/events/'+L.event);
if(fr.url.indexOf('captcha')>=0)return L.name+': GotSport wants a captcha first — pass it in this tab and click again';
var fd=new DOMParser().parseFromString(await fr.text(),'text/html');
var groups=[],ids={};
[].slice.call(fd.querySelectorAll('a[href*="schedules?group="]')).forEach(function(a){
var id=(a.getAttribute('href').match(/group=(\\d+)/)||[])[1];
var row=a.closest('.row'),b=row&&row.querySelector('b');
if(id&&b&&!ids[id]){ids[id]=1;groups.push([b.textContent.trim(),id]);}
});
var all=groups.length,names=groups.map(function(g){return g[0];});
if(L.only){var re=new RegExp(L.only,'i');groups=groups.filter(function(g){return re.test(g[0]);});}
if(all===0)return L.name+': no groups on the event page — the number may be last season\\'s';
if(groups.length===0)return L.name+': none of '+all+' groups match /'+L.only+'/i, e.g. '+names.slice(0,4).join(', ');
out[L.name]={};
for(var k=0;k<groups.length;k++){
var gt=await (await fetch('/org_event/events/'+L.event+'/schedules?date=All&group='+groups[k][1])).text();
out[L.name][groups[k][0]]=gt;
done++;total+=gt.length;
note('Reading '+L.name+' '+groups[k][0]+' ('+done+')\\n'+lines.join('\\n'));
await pause();
}
return L.name+': '+groups.length+(all>groups.length?' of '+all:'')+' groups';
}
async function readAthleteOne(L){
var divs=opts(await (await fetch(API+'/get-division-list-by-event-id/'+L.org+'/'+L.event+'/0/0')).text());
if(divs.length===0)return L.name+': no divisions — the ids may be last season\\'s';
out[L.name]={};
for(var j=0;j<divs.length;j++){
var t=await (await fetch(API+'/get-conference-schedules/'+L.org+'/'+L.season+'/'+L.event+'/'+divs[j][1]+'/0')).text();
out[L.name][divs[j][0]]=t;
done++;total+=t.length;
note('Reading '+L.name+' '+divs[j][0]+' ('+done+')\\n'+lines.join('\\n'));
await pause();
}
return L.name+': '+divs.length+' divisions';
}
(async function(){
var skipped=[];
for(var i=0;i<LEAGUES.length;i++){
var L=LEAGUES[i];
if(L.platform!==here){skipped.push(L.name);continue;}
note('Reading '+L.name+'…\\n'+lines.join('\\n'));
try{lines.push(await (L.platform==='gotsport'?readGotSport(L):readAthleteOne(L)));}
catch(e){lines.push(L.name+': '+e.message);}
}
var elsewhere=skipped.length?'\\n\\nNot from here: '+skipped.join(', ')+' — click this on '+(here==='gotsport'?'a theecnl.com schedule page':'a system.gotsport.com page')+' for those.':'';
if(!here){note('Open a theecnl.com schedule page or any system.gotsport.com page and click this there.\\n\\nClick to dismiss').onclick=function(){this.remove();};return;}
if(done===0){note('Nothing collected.\\n'+lines.join('\\n')+elsewhere+'\\n\\nClick to dismiss').onclick=function(){this.remove();};return;}
var file=(here==='gotsport'?'gotsport':'ecnl')+'-northwest-all.json';
var a=document.createElement('a');
a.href=URL.createObjectURL(new Blob([JSON.stringify(out)],{type:'application/json'}));
a.download=file;
document.body.appendChild(a);a.click();a.remove();
note('Saved '+file+'\\n'+done+' divisions, '+Math.round(total/1024)+'K\\n'+lines.join('\\n')+elsewhere+'\\n\\nClick to dismiss').onclick=function(){this.remove();};
})();
})();
`;

/** The bookmark's code, as a browser will run it. */
export function leagueFetchSource(leagues: League[] = LEAGUES): string {
  // Everything but the slug, which is ours and means nothing in a browser.
  const table = JSON.stringify(
    leagues.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== "eventSlug"))),
  );
  return SOURCE.replace("__LEAGUES__", table)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}

/** What goes in the bookmark: the tool itself, small enough to fit. */
export function leagueFetchBookmarklet(leagues: League[] = LEAGUES): string {
  return `javascript:${encodeURIComponent(leagueFetchSource(leagues))}`;
}
