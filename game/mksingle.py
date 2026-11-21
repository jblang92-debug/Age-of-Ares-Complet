# Assemble dist/ en un seul fichier HTML jouable hors ligne. Usage : python3 mksingle.py dist sortie.html
import sys, os, base64, json, re
root, out = sys.argv[1], sys.argv[2]
MIME = {'.glb': 'model/gltf-binary', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ttf': 'font/ttf'}
A = {}
T = {}   # fichiers JSON (modèles) : gardés en texte, sans double encodage base64
for d, _, fs in os.walk(os.path.join(root, 'assets')):
    for f in sorted(fs):
        ext = os.path.splitext(f)[1]
        if ext not in MIME: continue
        p = os.path.join(d, f); rel = os.path.relpath(p, root).replace(os.sep, '/')
        if ext == '.json': T[rel] = open(p, encoding='utf-8').read(); continue
        A[rel] = 'data:%s;base64,%s' % (MIME[ext], base64.b64encode(open(p, 'rb').read()).decode())
html = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
js = open(os.path.join(root, 'assets/app.js'), encoding='utf-8').read().replace('</script', '<\\/script')
shim = """<script>
// Version en un seul fichier : tous les fichiers du jeu sont inclus ci-dessous et servis depuis la mémoire.
(function(){
  var A=""" + json.dumps(A) + """;
  var T=""" + json.dumps(T, separators=(',', ':')).replace('</', '<\\/') + """;
  function map(u){ if(typeof u!=='string') return u; var i=u.indexOf('assets/'); if(i<0) return u; return A[u.slice(i).split('?')[0]]||u; }
  var f=window.fetch.bind(window);
  function key(u){ var i=u.indexOf('assets/'); return i<0?null:u.slice(i).split('?')[0]; }
  window.fetch=function(u,o){ if(typeof u==='string'){ var k=key(u); if(k&&T[k]!==undefined) return Promise.resolve(new Response(T[k],{status:200,headers:{'content-type':'application/json'}})); } return f(typeof u==='string'?map(u):u,o); };
  [[HTMLImageElement,'src'],[HTMLMediaElement,'src'],[HTMLLinkElement,'href']].forEach(function(e){
    var d=Object.getOwnPropertyDescriptor(e[0].prototype,e[1]);
    Object.defineProperty(e[0].prototype,e[1],{configurable:true,enumerable:true,get:function(){return d.get.call(this);},set:function(v){d.set.call(this,map(v));}});
  });
  // Boutons construits en texte HTML (innerHTML) : on remplace aussi les adresses d'images dans ce texte.
  function mapHtml(h){ return typeof h==='string' && h.indexOf('assets/')>=0 ? h.replace(/(src|href)="([^"]*assets\\/[^"]+)"/g,function(m,k,u){return k+'="'+map(u)+'"';}) : h; }
  var dh=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  Object.defineProperty(Element.prototype,'innerHTML',{configurable:true,enumerable:true,get:function(){return dh.get.call(this);},set:function(v){dh.set.call(this,mapHtml(v));}});
  var ia=Element.prototype.insertAdjacentHTML; Element.prototype.insertAdjacentHTML=function(w,h){ return ia.call(this,w,mapHtml(h)); };
  var sa=Element.prototype.setAttribute; Element.prototype.setAttribute=function(k,v){ return sa.call(this,k,(k==='src'||k==='href')?map(v):v); };
  var FF=window.FontFace;
  if(FF){ window.FontFace=function(n,src,o){ return new FF(n,String(src).replace(/url\\(([^)]+)\\)/,function(m,u){return 'url('+map(u)+')';}),o); }; }
})();
</script>
<script type="module">
""" + js + "\n</script>\n"
html, n = re.subn(r'<script type="module"[^>]*src="[^"]*app\.js"[^>]*></script>', '', html)
assert n == 1, n
i = html.rindex('</body>')
open(out, 'w', encoding='utf-8').write(html[:i] + shim + html[i:])
print(len(A) + len(T), 'fichiers inclus,', os.path.getsize(out), 'octets')
