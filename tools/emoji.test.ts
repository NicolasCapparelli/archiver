import test from 'node:test';
import assert from 'node:assert/strict';
import { emojis, emojiGroups, searchEmoji, emojiGridIndex } from '../src/emoji-search.ts';
test('catalog preserves complete Unicode sequences and unique payloads', () => {
  assert.equal(emojis.length, 3781);
  assert.equal(new Set(emojis.map(e => e.text)).size, emojis.length);
  for (const text of ['❤️', '👍🏽', '👩‍💻', '🇺🇸']) assert.ok(emojis.some(e => e.text === text));
  assert.equal(emojiGroups.length, 9);
});
test('meaning searches connect everyday feelings to emoji and retain literal priority', () => {
  for (const [query, text] of [['scared', '😨'], ['terrified', '😱'], ['nervous', '😰'], ['tired', '😴'], ['grateful', '🙏'], ['coding', '👩‍💻'], ['hungry', '😋']]) {
    assert.ok(searchEmoji(query).some(emoji => emoji.text === text), query);
  }
  assert.equal(searchEmoji('fearful face')[0].text, '😨');
  assert.equal(searchEmoji('scared', 'Flags').length, 0);
});
test('grid navigation follows responsive columns and bounds partial rows', () => {
  assert.equal(emojiGridIndex(2, 'ArrowDown', 11, 6), 8);
  assert.equal(emojiGridIndex(8, 'ArrowUp', 11, 6), 2);
  assert.equal(emojiGridIndex(8, 'ArrowDown', 11, 6), 10);
  assert.equal(emojiGridIndex(0, 'ArrowLeft', 11, 6), 0);
  assert.equal(emojiGridIndex(5, 'ArrowRight', 11, 6), 6);
  assert.equal(emojiGridIndex(2, 'End', 11, 6), 10);
  assert.equal(emojiGridIndex(2, 'ArrowDown', 0, 6), -1);
});
test('search supports names, aliases, shortcodes, categories and exact symbols', () => {
  assert.ok(searchEmoji(':thumbs_up:').some(e => e.text === '👍'));
  assert.ok(searchEmoji('+1').some(e => e.text === '👍'));
  assert.ok(searchEmoji('-1').some(e => e.text === '👎'));
  assert.ok(!searchEmoji('-1').some(e => e.text === '👍'));
  assert.ok(searchEmoji('lol').some(e => e.text === '😂'));
  assert.ok(searchEmoji('❤️').some(e => e.text === '❤️'));
  assert.ok(searchEmoji('medium skin tone').some(e => e.text === '👍🏽'));
  assert.ok(searchEmoji('flag united states', 'Flags').some(e => e.text === '🇺🇸'));
  assert.equal(searchEmoji('heart', 'Flags').length, 0);
  assert.equal(searchEmoji('xyznotanemoji').length, 0);
  assert.equal(searchEmoji('  ').length, emojis.length);
});
