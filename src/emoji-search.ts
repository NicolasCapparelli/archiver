import { emojiData } from './data/emoji.ts';
export interface Emoji { text: string; name: string; group: string; keywords: string }
const aliases: Record<string, string> = { 'thumbs up': 'like yes approve +1', 'thumbs down': 'dislike no -1', 'face with tears of joy': 'lol laugh laughing', 'red heart': 'love', 'party popper': 'celebrate celebration congratulations', 'check mark button': 'done success tick', 'fire': 'lit hot', 'pile of poo': 'poop' };
// Local meaning vocabulary: deterministic and offline, with no archive/AI request.
const meanings: readonly [RegExp, string][] = [
  [/fearful|screaming in fear|anxious|face with open mouth|shaking face/, 'scared scary afraid frightened fear terrified nervous panic worried anxious'],
  [/worried|anxious|downcast face with sweat/, 'worried worry stressed stress nervous anxious overwhelmed'],
  [/crying|disappointed|sad|frowning|broken heart/, 'sad unhappy upset sadness heartbroken grief'],
  [/angry|rage|pouting|symbols on mouth/, 'angry mad furious frustrated annoyed rage'],
  [/smiling|grinning|beaming|joy/, 'happy happiness cheerful glad smile smiling'],
  [/tears of joy|floor laughing|grinning squinting/, 'funny laugh laughing lol hilarious laughter'],
  [/sleep|yawning|bags under eyes/, 'tired sleepy exhausted sleep bored fatigue'],
  [/heart|kiss|couple|hug|open hands/, 'love loving affection hug romance romantic'],
  [/party|confetti|balloon|birthday|clinking glasses/, 'celebrate celebration congratulations congrats birthday party hooray'],
  [/thinking|monocle|raised eyebrow/, 'think thinking curious question wondering doubt skeptical'],
  [/sick|thermometer|medical mask|nauseated|vomiting|sneezing/, 'sick ill unwell illness cold flu nauseous'],
  [/food|savoring|drooling|fork|plate/, 'hungry hunger eat eating delicious yummy'],
  [/folded hands/, 'please thanks thank grateful gratitude pray prayer hope'],
  [/thumbs up|check mark|clapping hands/, 'yes okay ok good agree approval approved success done well'],
  [/thumbs down|cross mark|prohibited/, 'no nope reject rejection bad disagree wrong failure'],
  [/light bulb|brain/, 'idea ideas clever smart brainstorm inspiration'],
  [/laptop|desktop computer|keyboard|technologist/, 'computer coding programming developer software tech work'],
  [/rocket/, 'launch ship shipping fast space'],
  [/sparkles|magic wand/, 'magic magical clean shiny beautiful'],
  [/eyes|magnifying glass/, 'look looking search find attention watching'],
  [/hot beverage/, 'coffee tea caffeine drink morning'],
  [/locked|key|shield/, 'secure security private privacy password safety'],
  [/books|book|memo|pencil/, 'read reading write writing study learning notes'],
];
export const emojis: Emoji[] = emojiData.map(([text, name, group, subgroup]) => ({ text, name, group, keywords: `${name} ${group} ${subgroup} ${aliases[name.split(':')[0]] || ''} ${meanings.filter(([pattern]) => pattern.test(name.toLowerCase())).map(([, words]) => words).join(' ')}`.toLowerCase() }));
export const emojiGroups = [...new Set(emojis.map(emoji => emoji.group))];
export function searchEmoji(query: string, group = '') {
  const trimmed = query.trim().toLowerCase();
  const normalized = trimmed === '-1' ? trimmed : trimmed.replace(/[_:-]+/g, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);
  const matches = emojis.filter(emoji => (!group || emoji.group === group) && (emoji.text === query.trim() || words.every(word => emoji.keywords.includes(word))));
  if (!words.length) return matches;
  const score = (emoji: Emoji) => emoji.text === query.trim() ? 3 : emoji.name.includes(normalized) ? 2 : words.every(word => emoji.name.includes(word)) ? 1 : 0;
  return matches.sort((a, b) => score(b) - score(a));
}
export function emojiGridIndex(index: number, key: string, length: number, columns: number) {
  if (!length) return -1;
  if (key === 'Home' || key === 'PageUp') return 0;
  if (key === 'End' || key === 'PageDown') return length - 1;
  const step = key === 'ArrowDown' ? columns : key === 'ArrowUp' ? -columns : key === 'ArrowRight' ? 1 : -1;
  return Math.max(0, Math.min(length - 1, index + step));
}
