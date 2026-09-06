import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,symlink,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import opening from './scenes/opening.mjs';
import closing from './scenes/closing.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const timing=JSON.parse(await readFile(path.join(root,'timings.json'),'utf8'));
const baseCSS=await readFile(path.join(root,'shared.css'),'utf8');
const scenes=[...opening,...closing];
assert.equal(scenes.length,timing.scenes.length);
const escapeHTML=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const numbered=scenes.map((scene,i)=>{assert.equal(scene.id,timing.scenes[i].id);return {...scene,...timing.scenes[i]};});
function html(chosen,individual=false){
 const duration=individual?chosen[0].duration:timing.duration;
 const css=baseCSS+'\n'+chosen.map(s=>s.css).join('\n');
 const section=s=>`<section id="${s.id}" class="clip ${s.theme}" data-start="${individual?0:s.start}" data-duration="${s.duration}" data-track-index="1"><div class="brand"><img src="assets/icon-master.png" alt="">AI Translator</div><div class="film-marker">${(Number(s.id.slice(1))<14||s.id==='s17')?'SELECT / CONTROL / UNDERSTAND':'QUICK SETUP'}</div><div class="stage">${s.html}</div>${['s02','s04','s05','s06','s07','s08','s09','s10'].includes(s.id)?'<div class="sample-note">Illustrative text and translations</div>':''}</section>`;
 const motion=s=>`{const s=${individual?0:s.start},d=${s.duration};const q=selector=>'#${s.id} '+selector;const enters=document.querySelectorAll(q('.enter'));if(enters.length)tl.fromTo(enters,{opacity:0,y:45},{opacity:1,y:0,duration:.6,stagger:.12,ease:'power3.out'},s+.1);${s.motion}\n}`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1920,height=1080"><title>AI Translator: Select. Control. Understand.</title><script src="assets/gsap.min.js"></script><style>${css}</style></head><body><div id="film" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080">${chosen.map(section).join('\n')}${individual?'':`<audio id="soundtrack" src="assets/audio/master.wav" data-start="0" data-duration="${duration}" data-track-index="2" data-volume="1"></audio>`}</div><script>const tl=gsap.timeline({paused:true});${chosen.map(motion).join('\n')}window.__timelines["main"]=tl;</script></body></html>\n`;
}
await writeFile(path.join(root,'index.html'),html(numbered));
const config=await readFile(path.join(root,'hyperframes.json'),'utf8');
for(const scene of numbered){
 const out=path.join(root,'renders/scene-projects',scene.id);await mkdir(out,{recursive:true});
 await writeFile(path.join(out,'index.html'),html([scene],true));
 await writeFile(path.join(out,'hyperframes.json'),config);
 const target=path.join(out,'assets');try{await lstat(target);}catch(e){if(e.code!=='ENOENT')throw e;await symlink(path.relative(out,path.join(root,'assets')),target,'dir');}
}
const storyboard=['# Select. Control. Understand.','',`Measured runtime: ${timing.duration.toFixed(3)} seconds at 60 fps. All voice uses Kokoro Adam at 1.15x.`, '', 'The user approved autonomous production. The plan was reviewed for claims, real app behavior, readable pacing and exact setup order. No visual design change is made to the extension.', '', '## Video direction', '', 'A Control key and a blue text selection are the repeated visual idea. Native page and result card layers show the workflow. Motion follows selection, press, reveal, language change and copy. Light scenes match the app; darker purple scenes reuse the approved icon palette. Clear cuts change the shot while narration continues. Music is original local synthesis. The closing setup is 19.32% of the film.', ''];
for(const s of numbered)storyboard.push(`## ${s.id}: ${s.title}`, '', `Time: ${s.start.toFixed(3)} to ${(s.start+s.duration).toFixed(3)} seconds.`, '', `Voice: ${s.text}`, '', `Assets: approved icon-master.png, source-derived HTML controls, local GSAP. ${s.id==='s14'?'Illustrative Chrome Web Store listing for the planned release.':s.id==='s17'?'Final call to action with source repository.':'Example text is illustrative.'}`, '', 'Motion: first reveal within 0.7 seconds; visual action develops across the measured narration. See scene source for exact seekable timing.', '');
await writeFile(path.join(root,'STORYBOARD.md'),storyboard.join('\n').trimEnd()+'\n');
for(const value of [html(numbered),storyboard.join('\n')])assert.ok(!/[\u2013\u2014]/u.test(value),'Forbidden long dash');
assert.ok(Math.abs(timing.duration*60-Math.round(timing.duration*60))<1e-8);
console.log(`Built ${numbered.length} scenes, ${Math.round(timing.duration*60)} native frames, ${timing.duration.toFixed(3)} seconds.`);
