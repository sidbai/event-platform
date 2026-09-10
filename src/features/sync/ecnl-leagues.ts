/**
 * The ECNL leagues this directory follows, and a bookmark that collects them.
 *
 * Six leagues, one conference each, all of them the Northwest. They publish a
 * whole season at once and fill the scores in as games are played, so reading
 * them is a weekly habit rather than an import — and a habit survives on how
 * little it costs.
 *
 * The bookmark is the whole tool rather than a loader, unlike the copier.
 * That one outgrew a bookmark at ten kilobytes; this is one, so it fits — and
 * carrying it inline means there is no address to serve, nothing for a page's
 * content policy to refuse, and no secret to keep.
 */

export type EcnlLeague = {
  /** What the bundle labels its fragments with, and what --league matches. */
  name: string;
  /** AthleteOne's own three ids. Read off the page; see the skill. */
  org: number;
  season: number;
  event: number;
  /** The event these fixtures belong to here. */
  eventSlug: string;
};

/**
 * As of the 2026-27 season.
 *
 * These change when the season does, and the failure is loud rather than
 * quiet: a stale event id returns an empty division list, and the bookmark
 * says which league it happened to instead of writing a file with a hole in
 * it. The skill has the three lines that read the new ones off the page.
 */
export const ECNL_LEAGUES: EcnlLeague[] = [
  { name: "ECNL Boys", org: 12, season: 81, event: 4284, eventSlug: "ecnl-league-northwest-conference" },
  { name: "ECNL Girls", org: 9, season: 80, event: 4268, eventSlug: "ecnl-league-northwest-conference" },
  { name: "ECNL RL Boys", org: 16, season: 83, event: 4353, eventSlug: "ecnl-rl-league-northwest-conference" },
  { name: "ECNL RL Girls", org: 13, season: 82, event: 4311, eventSlug: "ecnl-rl-league-northwest-conference" },
  { name: "Pre-ECNL Boys", org: 22, season: 87, event: 4385, eventSlug: "pre-ecnl-league-northwest-conference" },
  { name: "Pre-ECNL Girls", org: 21, season: 86, event: 4384, eventSlug: "pre-ecnl-league-northwest-conference" },
];

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
var LEAGUES=__LEAGUES__;
function opts(html){
var d=new DOMParser().parseFromString(html,'text/html');
return [].slice.call(d.querySelectorAll('option')).filter(function(o){return o.value!=='0';})
.map(function(o){return [o.textContent.trim(),o.value];});
}
function note(msg){
var el=document.getElementById('kjs-league-note');
if(!el){el=document.createElement('div');el.id='kjs-league-note';
el.style.cssText='position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;padding:12px 14px;background:#131313;color:#d4af37;font:13px system-ui;border-radius:8px;white-space:pre-line';
document.body.appendChild(el);}
el.textContent=msg;
return el;
}
(async function(){
var out={},done=0,total=0,lines=[];
try{
for(var i=0;i<LEAGUES.length;i++){
var L=LEAGUES[i];
note('Reading '+L.name+'…\\n'+lines.join('\\n'));
var dl=await fetch(API+'/get-division-list-by-event-id/'+L.org+'/'+L.event+'/0/0');
var divs=opts(await dl.text());
if(divs.length===0){lines.push(L.name+': no divisions — the ids may be last season\\'s');continue;}
out[L.name]={};
for(var j=0;j<divs.length;j++){
var r=await fetch(API+'/get-conference-schedules/'+L.org+'/'+L.season+'/'+L.event+'/'+divs[j][1]+'/0');
var t=await r.text();
out[L.name][divs[j][0]]=t;
done++;total+=t.length;
note('Reading '+L.name+' '+divs[j][0]+' ('+done+')\\n'+lines.join('\\n'));
await new Promise(function(res){setTimeout(res,2500);});
}
lines.push(L.name+': '+divs.length+' divisions');
}
var a=document.createElement('a');
a.href=URL.createObjectURL(new Blob([JSON.stringify(out)],{type:'application/json'}));
a.download='ecnl-northwest-all.json';
document.body.appendChild(a);a.click();a.remove();
note('Saved ecnl-northwest-all.json\\n'+done+' divisions, '+Math.round(total/1024)+'K\\n'+lines.join('\\n')+'\\n\\nClick to dismiss').onclick=function(){this.remove();};
}catch(e){
note('Stopped: '+e.message+'\\n'+lines.join('\\n')+'\\n\\nClick to dismiss').onclick=function(){this.remove();};
}
})();
})();
`;

/** The bookmark's code, as a browser will run it. */
export function leagueFetchSource(leagues: EcnlLeague[] = ECNL_LEAGUES): string {
  const table = JSON.stringify(
    leagues.map((l) => ({ name: l.name, org: l.org, season: l.season, event: l.event })),
  );
  return SOURCE.replace("__LEAGUES__", table)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}

/** What goes in the bookmark: the tool itself, small enough to fit. */
export function leagueFetchBookmarklet(leagues: EcnlLeague[] = ECNL_LEAGUES): string {
  return `javascript:${encodeURIComponent(leagueFetchSource(leagues))}`;
}
