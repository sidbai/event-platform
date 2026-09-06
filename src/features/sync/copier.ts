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
  var tables=[].slice.call(document.querySelectorAll('table'));
  if(!tables.length){alert('No schedule table found on this page.');return;}
  var table=tables.sort(function(a,b){
    return b.querySelectorAll('tr').length-a.querySelectorAll('tr').length;
  })[0];

  var HEADER=__HEADER__;
  var out=[HEADER.join('\\t')];
  var date='';

  function text(el){return (el.innerText||'').trim();}
  function parts(el){
    return text(el).split('\\n').map(function(s){return s.trim();}).filter(Boolean);
  }

  [].slice.call(table.querySelectorAll('tr')).forEach(function(tr){
    var cells=[].slice.call(tr.children);
    var values=cells.map(text);

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

  var box=document.createElement('textarea');
  box.value=out.join('\\n');
  box.style.cssText='position:fixed;z-index:2147483647;top:5%;left:5%;width:90%;height:80%;font:12px monospace;padding:12px;border:2px solid #333;background:#fff;color:#000';
  var bar=document.createElement('div');
  bar.style.cssText='position:fixed;z-index:2147483647;bottom:5%;left:5%;width:90%;text-align:center;font:14px system-ui;background:#333;color:#fff;padding:8px';
  bar.textContent=(out.length-1)+' fixtures selected — copy, then paste into King Juan Soccer. Click here to close.';
  bar.onclick=function(){box.remove();bar.remove();};
  document.body.appendChild(box);
  document.body.appendChild(bar);
  box.focus();
  box.select();
})();`;

/** The bookmarklet's source, ready to be saved as a bookmark's address. */
export function copierBookmarklet(): string {
  const body = SOURCE.replace("__HEADER__", JSON.stringify(CANONICAL_HEADER));
  /*
   * The newlines stay. Collapsing them to save characters is what broke the
   * first version of this: a trailing `// comment` swallowed the statement
   * that followed it onto the same line, and the bookmarklet failed with a
   * ReferenceError the moment anybody clicked it. encodeURIComponent turns a
   * newline into %0A, which every browser accepts in a javascript: URL, so
   * there was nothing to win and a whole class of bug to lose.
   */
  return `javascript:${encodeURIComponent(body.trim())}`;
}
