import { CANONICAL_HEADER } from "./paste";

/**
 * A bookmarklet that reads a schedule table in the reader's own browser.
 *
 * Not a crawler and not a way around one. It runs only when a person clicks
 * it, only on the page they already have open, and it makes no requests at
 * all — everything it reads is already rendered on their screen. What it does
 * is take the guesswork out of the paste: a schedule table packs the
 * kick-off, the bracket slot and the division into a single cell, and how
 * that survives a browser's own copy is a guess. So this splits them into
 * named columns and hands back a format the importer reads exactly.
 *
 * The output is deliberately plain text in a box the person can see before
 * they copy it. Nothing is sent anywhere; they choose what to paste.
 */

/** The largest table on a page is the schedule. Every platform buries it. */
const SOURCE = `(function(){
  var HEADER=__HEADER__;
  var TABLE=__STANDINGS_HEADER__;

  function text(el){return (el.innerText||'').trim();}
  function parts(el){
    return text(el).split('\\n').map(function(s){return s.trim();}).filter(Boolean);
  }
  function cellsOf(tr){return [].slice.call(tr.children);}
  function lower(v){return (v||'').toLowerCase().replace(/\\s+/g,' ').trim();}
  function indexOfName(head,names){
    for(var i=0;i<head.length;i++){if(names.indexOf(head[i])>=0)return i;}
    return -1;
  }

  /*
   * AthleteOne stacks a fixture into three cells rather than laying it out in
   * columns: when it was played, who played and where, and how it finished.
   * Everything this needs is inside them, in a fixed order, so the row is
   * read by position within each cell rather than by column.
   */
  function a1Fixture(meta,who,tail){
    var venue=who[2]||'', field='';
    var cut=venue.lastIndexOf(' - ');
    if(cut>0){field=venue.slice(cut+3);venue=venue.slice(0,cut);}
    var nums=tail.filter(function(v){return /^\\d+$/.test(v);});
    return [
      meta[0]||'', meta[1]||'', '', meta[2]||'',
      who[0]||'', nums.length>1?nums[0]:'', nums.length>1?nums[1]:'', who[1]||'',
      field, venue
    ];
  }

  /** A standings table, read by column name — every platform orders them differently. */
  function tableRows(table){
    var rows=[].slice.call(table.querySelectorAll('tr'));
    if(rows.length<2)return [];
    var head=cellsOf(rows[0]).map(function(c){return lower(text(c));});
    var team=indexOfName(head,['team','teams','club','name','team name']);
    var pts=indexOfName(head,['pts','pt','points','total points']);
    if(team<0||pts<0)return [];
    var gp=indexOfName(head,['gp','pl','mp','played','games','games played']),
        w=indexOfName(head,['w','win','wins','won']),
        d=indexOfName(head,['d','t','tie','ties','draw','draws','drawn','tied']),
        l=indexOfName(head,['l','loss','losses','lost']),
        gf=indexOfName(head,['gf','f','for','goals for','gs','scored']),
        ga=indexOfName(head,['ga','a','against','goals against','gc','conceded']);

    var out=[];
    rows.slice(1).forEach(function(tr){
      var c=cellsOf(tr).map(text);
      function at(i){
        if(i<0||c[i]==null)return '';
        var m=c[i].replace(/\\s+/g,' ').trim().match(/-?\\d+/);
        return m?m[0]:'';
      }
      var name=(c[team]||'').replace(/\\s+/g,' ').trim();
      if(!name)return;
      out.push([name,at(gp),at(w),at(d),at(l),at(gf),at(ga),at(pts)].join('\\t'));
    });
    return out;
  }

  /*
   * The seam the tests run against.
   *
   * With no document there is no page to read, so the artifact hands back the
   * functions instead — which means what is tested is this exact source and
   * not a second copy of the logic that can drift away from it.
   */
  if(typeof document==='undefined'){
    return {a1Fixture:a1Fixture,tableRows:tableRows};
  }

  var tables=[].slice.call(document.querySelectorAll('table'));
  if(!tables.length){alert('No schedule or standings table found on this page.');return;}

  /*
   * A standings page first, because a table naming a team column and a points
   * column is a standing and nothing else is — and unlike a schedule there
   * may be several, one per group, which all belong to the same paste.
   */
  var standings=[];
  tables.forEach(function(t){standings=standings.concat(tableRows(t));});
  if(standings.length){
    show([TABLE.join('\\t')].concat(standings),'standings rows');
    return;
  }

  var table=tables.sort(function(a,b){
    return b.querySelectorAll('tr').length-a.querySelectorAll('tr').length;
  })[0];

  var out=[HEADER.join('\\t')];
  var date='';

  /*
   * AthleteOne prints its own header, and its rows are stacked cells rather
   * than columns — a generic read puts both teams in one field and loses the
   * date and the score. Recognised by what the header says, so nothing here
   * depends on the address a person happens to be on.
   */
  var a1=cellsOf(table.querySelectorAll('tr')[0]||{children:[]}).map(function(c){
    return lower(text(c));
  }).join('|');
  var isA1=a1.indexOf('game info')>=0 && a1.indexOf('teams & venues')>=0;

  [].slice.call(table.querySelectorAll('tr')).forEach(function(tr){
    var cells=[].slice.call(tr.children);
    var values=cells.map(text);

    if(isA1){
      if(cells.length<4)return;
      var meta1=parts(cells[0]);
      if(meta1.length<2)return;              // the header row, and any spacer
      var who=parts(cells[1]);
      if(who.length<2)return;
      out.push(a1Fixture(meta1,who,parts(cells[cells.length-1])).join('\\t'));
      return;
    }

    // A row that is only a date (often with "42 Games" beside it) is the
    // heading every row under it belongs to.
    if(values.length<=2 && /\\d{4}/.test(values[0]) && /[a-z]/i.test(values[0])){
      date=values[0];
      return;
    }
    if(values.length<5) return;
    if(/^(game|home team|away team|location)$/i.test(values[0])) return;

    var meta=parts(cells[0]);          // time, slot, division
    var where=parts(cells[cells.length-1]); // field, venue
    var middle=values.slice(1,-1).filter(function(v){return v!=='';});
    if(middle.length<2) return;

    var home=middle[0], away=middle[middle.length-1];
    var hs='', as='';
    if(middle.length>=4){ hs=middle[1]; as=middle[2]; away=middle[3]; }
    else if(middle.length===3){ var m=middle[1].match(/^(\\d+)\\s*[-–:]\\s*(\\d+)$/); if(m){hs=m[1];as=m[2];} away=middle[2]; }

    out.push([
      date, meta[0]||'', meta[1]||'', meta[2]||'',
      home, /^\\d+$/.test(hs)?hs:'', /^\\d+$/.test(as)?as:'', away,
      where[0]||'', where[1]||''
    ].join('\\t'));
  });

  if(out.length===1){alert('Found the table but no fixtures in it.');return;}
  show(out,'fixtures');

  function show(lines,what){
    var box=document.createElement('textarea');
    box.value=lines.join('\\n');
    box.style.cssText='position:fixed;z-index:2147483647;top:5%;left:5%;width:90%;height:80%;font:12px monospace;padding:12px;border:2px solid #333;background:#fff;color:#000';
    var bar=document.createElement('div');
    bar.style.cssText='position:fixed;z-index:2147483647;bottom:5%;left:5%;width:90%;text-align:center;font:14px system-ui;background:#333;color:#fff;padding:8px';
    bar.textContent=(lines.length-1)+' '+what+' selected — copy, then paste into King Juan Soccer. Click here to close.';
    bar.onclick=function(){box.remove();bar.remove();};
    document.body.appendChild(box);
    document.body.appendChild(bar);
    box.focus();
    box.select();
  }
})();`;

/**
 * The header the standings half emits.
 *
 * Named for what parsePastedStandings already reads, so the two halves cannot
 * drift: it looks these up by name, and a column it does not recognise is a
 * column silently dropped.
 */
export const STANDINGS_HEADER = ["team", "gp", "w", "d", "l", "gf", "ga", "pts"] as const;

/** The bookmarklet's source, ready to be saved as a bookmark's address. */
export function copierBookmarklet(): string {
  const body = SOURCE.replace("__HEADER__", JSON.stringify(CANONICAL_HEADER)).replace(
    "__STANDINGS_HEADER__",
    JSON.stringify(STANDINGS_HEADER),
  );
  /*
   * The newlines stay. Collapsing them to save characters is what broke the
   * first version of this: a trailing `// comment` swallowed the statement
   * that followed it onto the same line, and the bookmarklet failed with a
   * ReferenceError the moment anybody clicked it. encodeURIComponent turns a
   * newline into %0A, which every browser accepts in a javascript: URL, so
   * there was nothing to win and a whole class of bug to lose.
   *
   * What does come out is the part that cannot bite: the block comments
   * explaining the source, and the indentation. Both cost three characters
   * each once encoded, a bookmark URL has a ceiling, and neither can swallow
   * a statement because every line break survives.
   */
  const lean = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
  return `javascript:${encodeURIComponent(lean.trim())}`;
}
