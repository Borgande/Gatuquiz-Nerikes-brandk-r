// Regressionstest for omradeslogiken. Kor: node tools/test-areas.js
// Plockar ut funktionerna direkt ur index.html sa testet aldrig glider
// isar fran koden det testar.
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');

// Plocka ut de fyra funktioner som Fas 1 rör
function grab(name){
  const i=src.indexOf('function '+name+'(');
  if(i<0) throw new Error('hittar inte '+name);
  let d=0,started=false;
  for(let j=i;j<src.length;j++){
    if(src[j]==='{'){d++;started=true;}
    else if(src[j]==='}'){d--;if(started&&d===0)return src.slice(i,j+1);}
  }
}
const code=['outerRings','pointInPolygon','assignAreas','areaProp','getStation','getSource'].map(grab).join('\n');
let STATION={id:'orebro',sources:[{id:'orebro'}]};
let AREAS_GEO=JSON.parse(fs.readFileSync(path.join(ROOT,'areas.geojson'),'utf8'));
eval(code);

let fail=0;
const ok=(c,m)=>{console.log((c?'  PASS  ':'  FAIL  ')+m); if(!c)fail++;};

console.log('--- getStation mot verklig areas.geojson ---');
ok(getStation('Kumla')==='byrsta','Kumla -> station byrsta (gav alltid orebro forut)');
ok(getStation('Hallsberg')==='byrsta','Hallsberg -> station byrsta');
ok(getSource('Kumla')==='kumla','Kumla -> kalla kumla');
ok(getSource('Hallsberg')==='hallsberg','Hallsberg -> kalla hallsberg');
ok(getSource('Centrum')==='orebro','Centrum -> kalla orebro');
ok(getStation('Centrum')==='orebro','Centrum -> orebro');
ok(getStation('Finns inte')==='orebro','okänt namn -> orebro');

console.log('--- outerRings geometrityper ---');
ok(outerRings({type:'Polygon',coordinates:[[[0,0],[1,0],[1,1]]]}).length===1,'Polygon ger 1 ring');
ok(outerRings({type:'MultiPolygon',coordinates:[[[[0,0]]],[[[5,5]]]]}).length===2,'MultiPolygon ger 2 ringar');
ok(outerRings({type:'Point',coordinates:[15.2,59.2]}).length===0,'Point ger 0 ringar (ignoreras)');
ok(outerRings(null).length===0,'saknad geometri ger 0 ringar');

console.log('--- assignAreas mot verkliga koordinater ---');
// Punkt mitt i Kumla-polygonen
const kumlaRing=AREAS_GEO.features.find(f=>f.properties['Område']==='Kumla').geometry.coordinates[0];
const cx=kumlaRing.reduce((s,p)=>s+p[0],0)/kumlaRing.length;
const cy=kumlaRing.reduce((s,p)=>s+p[1],0)/kumlaRing.length;
const r=assignAreas([[cy,cx],[cy,cx],[cy,cx]]);
ok(r.includes('Kumla'),'gata i Kumla-polygonen -> '+JSON.stringify(r));
ok(assignAreas([[0,0]])[0]==='Övrigt','gata utanför alla polygoner -> Övrigt');
ok(assignAreas([])[0]==='Övrigt','tom koordinatlista -> Övrigt');

console.log('--- MultiPolygon fungerar (nytt) ---');
AREAS_GEO={type:'FeatureCollection',features:[
  {properties:{'Område':'Multi',station:'x'},geometry:{type:'MultiPolygon',coordinates:[
    [[[0,0],[0,1],[1,1],[1,0],[0,0]]],
    [[[10,10],[10,11],[11,11],[11,10],[10,10]]]]}},
  {properties:{'Område':'Punkt',station:'y'},geometry:{type:'Point',coordinates:[0.5,0.5]}}
]};
ok(assignAreas([[0.5,0.5]]).includes('Multi'),'punkt i MultiPolygons forsta del hittas');
ok(assignAreas([[10.5,10.5]]).includes('Multi'),'punkt i MultiPolygons andra del hittas');
ok(!assignAreas([[0.5,0.5]]).includes('Punkt'),'Point-feature matchar aldrig');
const multi=assignAreas([[0.5,0.5],[0.5,0.5],[0.5,0.5]]);
ok(multi.filter(a=>a==='Multi').length===1,'MultiPolygon dubbelraknas inte');

console.log('--- admin.html far inte glida isar fran index.html ---');
// Ritverktyget har egna kopior av omradeslogiken. Just den logiken har redan
// orsakat en bugg (getKommun gav alltid 'orebro'), sa har kors bada filernas
// versioner mot samma indata och maste ge samma svar.
{
  const adm=fs.readFileSync(path.join(ROOT,'admin.html'),'utf8');
  const plocka=(txt,n)=>{
    const i=txt.indexOf('function '+n+'(');
    if(i<0) return null;
    let d=0,startad=false;
    for(let j=i;j<txt.length;j++){
      if(txt[j]==='{'){d++;startad=true;}
      else if(txt[j]==='}'){d--;if(startad&&d===0)return txt.slice(i,j+1);}
    }
    return null;
  };
  const namn=['outerRings','pointInPolygon','assignAreas'];
  const saknas=namn.filter(n=>!plocka(adm,n));
  ok(saknas.length===0,'admin.html har alla tre funktionerna'+(saknas.length?' (saknar '+saknas+')':''));

  if(!saknas.length){
    const geoRiktig=JSON.parse(fs.readFileSync(path.join(ROOT,'areas.geojson'),'utf8'));
    const kropp=namn.map(n=>plocka(adm,n)).join(' ')+
                ' return {outerRings:outerRings,pointInPolygon:pointInPolygon,assignAreas:assignAreas};';
    const A=new Function('AREAS_GEO',kropp)(geoRiktig);

    AREAS_GEO=geoRiktig; // bada maste se samma omradesdata

    const prov=[];
    for(const f of fs.readdirSync(path.join(ROOT,'data'))){
      if(!f.endsWith('.streets.json')) continue;
      const d=JSON.parse(fs.readFileSync(path.join(ROOT,'data',f),'utf8'));
      for(const n of Object.keys(d.streets).slice(0,60)) prov.push([].concat(...d.streets[n]));
    }
    let olika=0;
    for(const c of prov){
      if(JSON.stringify(assignAreas(c).sort())!==JSON.stringify(A.assignAreas(c).sort())) olika++;
    }
    ok(olika===0,'assignAreas ger samma svar i bada filerna ('+prov.length+' gator'+
       (olika?', '+olika+' SKILJER SIG':'')+')');
    ok(A.outerRings({type:'Point',coordinates:[15,59]}).length===0,'admin: Point ger 0 ringar');
    ok(A.outerRings({type:'MultiPolygon',coordinates:[
        [[[0,0],[1,0],[1,1],[0,0]]],[[[5,5],[6,5],[6,6],[5,5]]]]}).length===2,
       'admin: MultiPolygon ger 2 ringar');
  }
}

console.log('--- gator med samma namn pa olika platser ---');
// En gata som heter likadant i flera byar far INTE slas ihop: da hamnar hela
// klumpen i ett omrade och lyser upp tva mil bort. build-streets.py delar dem
// via clusters-faltet.
{
  const geoRiktig=JSON.parse(fs.readFileSync(path.join(ROOT,'areas.geojson'),'utf8'));
  let medKluster=0, delade=[];
  for(const fil of fs.readdirSync(path.join(ROOT,'data'))){
    if(!fil.endsWith('.streets.json')) continue;
    const d=JSON.parse(fs.readFileSync(path.join(ROOT,'data',fil),'utf8'));
    const kl=d.clusters||{};
    medKluster+=Object.keys(kl).length;
    const station=d.station||'orebro';
    AREAS_GEO={type:'FeatureCollection',
      features:geoRiktig.features.filter(f=>(f.properties.station||'orebro')===station)};
    for(const namn of Object.keys(kl)){
      const segs=d.streets[namn], ids=kl[namn], g={};
      segs.forEach((seg,i)=>{ (g[ids[i]]=g[ids[i]]||[]).push(...seg); });
      const per=Object.values(g).map(c=>assignAreas(c).join('+'));
      if(new Set(per).size>1) delade.push(namn+' ('+station+'): '+per.join(' | '));
    }
  }
  ok(medKluster>0,'datafilerna har clusters-faltet ('+medKluster+' gator uppdelade)');
  ok(delade.length>0,'minst en gata har forekomster i olika omraden ('+delade.length+' st)');
  if(delade.length) console.log('       t.ex. '+delade[0]);
}

console.log('--- vagtyper som ska finnas ---');
{
  const o=JSON.parse(fs.readFileSync(path.join(ROOT,'data','nerikes-orebro.streets.json'),'utf8'));
  // Nygatan har en gagatedel, Norra Skyttegatan en cykelvagsdel. Bada saknades
  // innan filtret utokades.
  ok((o.streets['Nygatan']||[]).length>=8,'Nygatan har gagate- och pafartsdelarna');
  ok((o.streets['Norra Skyttegatan']||[]).length>=2,'Norra Skyttegatan har cykelvagsdelen');
  ok(!!o.streets['Fisktorget'],'torg finns med som egna namn');
  // Rena cykelvagar ska INTE bli egna svar
  ok(!o.streets['Fargaregrand']&&!o.streets['Holmen runt'],'rena cykelvagar ar inte egna svar');
}

console.log(fail?('\n'+fail+' TEST MISSLYCKADES'):'\nALLA TESTER OK');
process.exit(fail?1:0);
