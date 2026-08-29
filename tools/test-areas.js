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

console.log(fail?('\n'+fail+' TEST MISSLYCKADES'):'\nALLA TESTER OK');
process.exit(fail?1:0);
