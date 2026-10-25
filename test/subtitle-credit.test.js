import test from 'node:test';
import assert from 'node:assert/strict';
import { assTranslator, subtitleCredit } from '../src/subtitle-credit.js';
import { validateLibrary } from '../src/core.js';

test('only explicit translation credits are read from the ASS info section', () => {
  assert.equal(assTranslator('\uFEFF[Script Info]\r\n\r\nOriginal Translation: Команда переводчиков\r\n[Events]\r\n'), 'Команда переводчиков');
  assert.equal(assTranslator('[Script Info]\nOriginalTranslation: Alex & Friends\n[Events]'), 'Alex & Friends');
  for (const content of ['[Script Info]\nTitle: Anime\nScript Updated By: Editor\n[Events]\nOriginal Translation: Not a credit', '[Script Info]\nOriginal Translation: unknown', '[Script Info]\nOriginal Translation: '+ 'x'.repeat(121)]) assert.equal(assTranslator(content),'');
});
test('provided translator/studio names win over generic track titles without guessing authors from filenames', () => {
  assert.equal(subtitleCredit({translator:' Реальный переводчик ',studio:'Команда',label:'Russian'}),'Реальный переводчик');
  assert.equal(subtitleCredit({studio:'Название команды',label:'Russian'}),'Название команды');
  assert.equal(subtitleCredit({label:'Личная подпись',format:'ass',content:'[Script Info]\nOriginal Translation: Другой автор'}),'Личная подпись');
  assert.equal(subtitleCredit({format:'srt',filename:'[SomeStudio] 01.srt'}),'Переводчик не указан');
});
test('imported credits and unknown authors persist as safe human labels', () => {
  const track={id:'subs',language:'ru',format:'ass',content:'[Script Info]\nOriginal Translation: Имя переводчика\n[Events]'};
  const title={id:'anime',title:'Аниме',episodes:[{id:'1',number:1,sources:[{id:'video',url:'https://media.test/1.mp4',voice:'Оригинал',audioType:'original',language:'ja',quality:1080}],subtitles:[track]}]};
  const check = item => validateLibrary([{...title,episodes:[{...title.episodes[0],subtitles:[item]}]}])[0].episodes[0].subtitles[0];
  assert.equal(check(track).label,'Имя переводчика');
  assert.equal(check({...track,translator:'Другая команда'}).label,'Другая команда');
  assert.equal(check({...track,label:'Старая\nподпись'}).label,'Старая\nподпись');
  assert.equal(check({...track,content:'[Script Info]\n[Events]'}).label,'Переводчик не указан');
  assert.throws(()=>check({...track,translator:'x'.repeat(121)}));
  assert.throws(()=>check({...track,studio:'Bad\u0000Name'}));
});
