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
   * How many rows the page says it holds, when it says.
   *
   * AthleteOne paginates at ten and prints "Lines per page 1-10 of 34". A
   * basket quietly holding ten of thirty-four is the worst outcome here,
   * because it looks complete — so the difference is said out loud rather
   * than fixed by clicking their pager, which would make requests this must
   * not make.
   */
  function missingFrom(pageText,got){
    var m=(pageText||'').match(/lines per page[^0-9]*[0-9]+\\s*[-–]\\s*[0-9]+\\s*of\\s*([0-9]+)/i);
    var total=m?parseInt(m[1],10):0;
    return total>got?total-got:0;
  }

  /**
   * What to call the saved file.
   *
   * The host and the date, because the two questions asked of a file found a
   * week later are "where did this come from" and "when". Tab-separated, and
   * named .txt rather than .csv: these rows carry team names like
   * "XF, U14, B12 - 13, RCL 1", and a spreadsheet opening that as CSV splits
   * one team across four columns.
   */
  function fileName(host,now,what){
    var day=new Date(now).toISOString().slice(0,10);
    var site=(host||'source').replace(/^www\./,'').replace(/[^a-z0-9.-]/gi,'');
    return (what||'schedule')+'-'+site+'-'+day+'.txt';
  }

  /** Everything of one kind that the basket holds, in the order collected. */
  function collected(basket,kind){
    var lines=[],pages=0,missing=0;
    Object.keys(basket).forEach(function(k){
      if(basket[k].kind!==kind)return;
      pages++;
      missing+=basket[k].missing||0;
      lines=lines.concat(basket[k].lines);
    });
    return {lines:lines,pages:pages,missing:missing};
  }

  /*
   * The seam the tests run against.
   *
   * With no document there is no page to read, so the artifact hands back the
   * functions instead — which means what is tested is this exact source and
   * not a second copy of the logic that can drift away from it.
   */
  if(typeof document==='undefined'){
    return {
      a1Fixture:a1Fixture,
      tableRows:tableRows,
      missingFrom:missingFrom,
      collected:collected,
      fileName:fileName
    };
  }

  /*
   * Each click adds this page to a basket, and shows everything in it.
   *
   * One page at a time was fine until AthleteOne, where an event is
   * twenty-seven flights behind click-only navigation with no list of links
   * to hand anybody: copying each separately is twenty-seven trips between
   * two tabs. The basket survives the app's own navigation — sessionStorage
   * rather than a variable, so it outlives a reload too — and the last click
   * hands over the lot.
   *
   * It still acts only when clicked. No timer, no observer, and no request of
   * its own: everything it reads is what this person's own browsing has
   * already put on screen, which is why a site that refuses crawlers is not
   * being crawled here.
   */
  var KEY='kjs.copier.basket';
  var basket={};
  try{basket=JSON.parse(sessionStorage.getItem(KEY)||'{}');}catch(e){basket={};}
  function save(){try{sessionStorage.setItem(KEY,JSON.stringify(basket));}catch(e){}}

  var tables=[].slice.call(document.querySelectorAll('table'));
  if(!tables.length){alert('No schedule or standings table found on this page.');return;}

  /*
   * A standings page first, because a table naming a team column and a points
   * column is a standing and nothing else is — and unlike a schedule there
   * may be several, one per group, which all belong to the same paste.
   */
  var standings=[];
  tables.forEach(function(t){standings=standings.concat(tableRows(t));});
  if(standings.length){add('standings',standings);return;}

  var table=tables.sort(function(a,b){
    return b.querySelectorAll('tr').length-a.querySelectorAll('tr').length;
  })[0];

  var out=[];
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

  if(!out.length){alert('Found the table but no fixtures in it.');return;}
  add('fixtures',out);

  /** Put this page in the basket under its own address, and show the lot. */
  function add(kind,lines){
    basket[location.pathname]={
      kind:kind,
      lines:lines,
      missing:missingFrom(document.body.innerText,lines.length)
    };
    save();
    show();
  }

  function show(){
    var fix=collected(basket,'fixtures'), tab=collected(basket,'standings');
    var body=[];
    if(fix.pages) body=body.concat([HEADER.join('\\t')],fix.lines);
    if(tab.pages) body=body.concat([TABLE.join('\\t')],tab.lines);

    var note=[];
    if(fix.pages) note.push(fix.lines.length+' fixtures from '+fix.pages+' page(s)');
    if(tab.pages) note.push(tab.lines.length+' standings rows from '+tab.pages+' page(s)');
    var gone=fix.missing+tab.missing;
    if(gone) note.push('⚠ '+gone+' row(s) not on screen — raise "Lines per page" and click again');
    if(fix.pages&&tab.pages) note.push('two tables — paste each into its own box');

    var old=document.getElementById('kjs-copier');
    if(old)old.remove();

    var wrap=document.createElement('div');
    wrap.id='kjs-copier';
    wrap.style.cssText='position:fixed;z-index:2147483647;inset:5%;display:flex;flex-direction:column;gap:8px;font:14px system-ui';

    var box=document.createElement('textarea');
    box.value=body.join('\\n');
    box.style.cssText='flex:1;font:12px monospace;padding:12px;border:2px solid #333;background:#fff;color:#000';

    var bar=document.createElement('div');
    bar.style.cssText='background:#333;color:#fff;padding:8px;text-align:center';
    bar.textContent=note.join(' · ')+' — click again on the next flight, then copy or save.';

    /*
     * Saving, as well as copying.
     *
     * The basket dies with the tab, so a person collecting twenty-seven
     * flights has to finish in one sitting or lose the lot. A file survives
     * that, survives an import the date guard refuses, and is still there
     * next week when somebody asks what was actually imported.
     */
    var save=document.createElement('button');
    save.textContent='Save as file';
    save.style.cssText='margin-left:8px;padding:2px 8px';
    save.onclick=function(){
      /*
       * One file per kind, never one holding both.
       *
       * The box shows fixtures and standings together so they can be read,
       * but a file with both in it imports as neither: the first line decides
       * how the whole thing is parsed, and the standings header becomes a
       * fixture called "l v pts". The importer refuses such a file now, which
       * is a message rather than a silent mess — but not making it is better
       * than explaining it.
       */
      if(fix.pages) download([HEADER.join('\\t')].concat(fix.lines),'schedule');
      if(tab.pages) download([TABLE.join('\\t')].concat(tab.lines),'standings');
    };

    function download(lines,what){
      var blob=new Blob([lines.join('\\n')],{type:'text/plain'});
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=fileName(location.hostname,Date.now(),what);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    }

    var close=document.createElement('button');
    close.textContent='Close';
    close.style.cssText='margin-left:8px;padding:2px 8px';
    close.onclick=function(){wrap.remove();};

    var clear=document.createElement('button');
    clear.textContent='Start over';
    clear.style.cssText='margin-left:8px;padding:2px 8px';
    clear.onclick=function(){basket={};save();wrap.remove();};

    bar.appendChild(save);
    bar.appendChild(close);
    bar.appendChild(clear);
    wrap.appendChild(box);
    wrap.appendChild(bar);
    document.body.appendChild(wrap);
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

/**
 * The copier's code, as a browser will run it.
 *
 * Comments and indentation come out — they cost three characters each once
 * encoded and explain nothing to a browser — but every line break stays.
 * Collapsing those is what broke the first version of this: a trailing
 * `// comment` swallowed the statement after it onto the same line, and the
 * thing failed with a ReferenceError the moment anybody clicked it.
 */
export function copierSource(): string {
  const body = SOURCE.replace("__HEADER__", JSON.stringify(CANONICAL_HEADER)).replace(
    "__STANDINGS_HEADER__",
    JSON.stringify(STANDINGS_HEADER),
  );
  return body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}

/**
 * What goes in the bookmark: a loader, not the tool.
 *
 * The tool itself outgrew a bookmark. It was ten kilobytes by the time it
 * collected across flights and saved files, and browsers would not take the
 * address — which is a failure with no error message, just a bookmark that
 * does not work.
 *
 * So the bookmark fetches the code from here and runs it. Two things follow,
 * and the second is worth more than the first: it fits, and it updates
 * itself. Every change to the copier today ended with "re-grab the
 * bookmarklet", which is a step people forget and then debug the old version.
 *
 * On the request: this asks OUR server for OUR code, once, when somebody
 * clicks. It still asks the site being read for nothing at all — that page is
 * already open, and everything the tool sees is what the person's own
 * browsing put on screen. The property that makes this not a crawler is
 * untouched.
 */
export function copierBookmarklet(origin: string): string {
  const src = `${origin.replace(/\/$/, "")}${COPIER_PATH}`;
  /*
   * Cache-busted on purpose. A bookmarklet that loads a stale copy is the
   * self-updating property quietly not working, and the file is small.
   */
  const loader = [
    "(function(){",
    "var s=document.createElement('script');",
    `s.src=${JSON.stringify(src)}+'?t='+Date.now();`,
    /*
     * onerror says the script did not load. It does not say why, and the
     * first version of this asserted a cause — "its content policy blocks
     * outside scripts" — which sent somebody looking at the wrong site
     * entirely when the real answer was that our own server was answering
     * the request with a bot-protection challenge.
     *
     * So it describes the symptom and names both candidates, in the order
     * they are worth checking.
     */
    "s.onerror=function(){alert('The copier did not load from ' + " +
      JSON.stringify(new URL(src).host) +
      " + '.\\n\\nEither that site is unreachable or refusing the request, or this page blocks outside scripts. Opening the address in a tab will say which.');};",
    "document.body.appendChild(s);",
    "})();",
  ].join("");
  return `javascript:${encodeURIComponent(loader)}`;
}

/** Where the copier's code is served. Shared by the route and the bookmark. */
export const COPIER_PATH = "/copier.js";
