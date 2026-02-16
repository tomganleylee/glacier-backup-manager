// Rarity keywords from analyze-rarity.py
// Shows matching these keywords are likely hard to find online

export const RARE_KEYWORDS = [
  'utopia', 'brass eye', 'jam ', 'nathan barley', 'big train', 'black books',
  'mighty boosh', 'garth marenghi', 'darkplace', 'league of gentlemen', 'psychoville', 'inside no',
  'reece shearsmith', 'steve pemberton', 'alan partridge', 'knowing me', 'mid morning', 'monkey dust',
  'ideal ', 'misfits', 'inbetweeners', 'fades', 'skins ', 'glue ',
  'humans ', 'being human', 'merk', 'phoneshop', 'friday night dinner', 'catastrophe',
  'raised by wolves', 'chewing gum', 'fleabag', 'this country', 'stath lets flats', 'ghosts ',
  'people just do nothing', 'kurupt fm', 'toast of london', 'toast of tinseltown', 'year of the rabbit', 'flowers ',
  'back to life', 'feel good', 'dead pixels', 'gameface', 'brassic', 'after life',
  'derek ', 'extras ', 'karl pilkington', 'an idiot abroad', 'sick note', 'camping ',
  'hapless', 'cockroaches', 'jericho', 'revolution ', 'defiance', 'dominion',
  'terra nova', 'threshold', 'surface ', 'invasion ', 'flashforward', 'v 2009',
  'the event', 'alcatraz', 'day break', 'dark matter', 'killjoys', 'wynonna earp',
  'z nation', 'van helsing', 'the strain', 'helix ', 'between ', 'containment',
  'the mist', 'the passage', 'salvation ', 'nightflyers', 'another life', 'away ',
  'pandora ', 'debris ', 'la brea', 'the 4400', 'new amsterdam', 'crossing lines',
  'unforgettable', 'forever ', 'stalker ', 'backstrom', 'second chance', 'conviction',
  'deception ', 'instinct', 'ransom ', 'wisdom of the crowd', 'reverie', 'emerge',
  'manifest', 'the inbetween', 'stumptown', 'lincoln rhyme', 'tommy ', 'clarice',
  'big sky', 'the rookie feds', 'so help me todd', 'american horror stories', 'slasher', 'scream queens',
  'scream the series', 'harper island', 'wolf creek', 'the exorcist series', 'outcast ', 'the purge series',
  'channel zero', 'marianne', 'two sentence horror', 'creepshow', 'lovecraft country', 'them ',
  'chapelwaite', 'archive 81', 'brand new cherry flavor', 'midnight mass', 'the midnight club', 'guillermo del toro cabinet',
  'ash vs evil dead', 'stan against evil', 'santa clarita diet', 'crazyhead', 'dirk gently', 'ghosted ',
  'son of zorn', 'people of earth', 'wrecked ', 'the last man on earth', 'happy endings', 'dont trust the b',
  'selfie', 'trophy wife', 'a to z', 'marry me', 'benched', 'ground floor',
  'undateable', 'telenovela', 'american housewife', 'splitting up together', 'single parents', 'united we fall',
  'call your mother', 'pivoting', 'american auto', 'true lies series', 'world beyond', 'fear the walking dead',
  'into the badlands', 'marco polo', 'frontier ', 'knightfall', 'the bastard son', 'shadow and bone',
  'cursed ', 'the letter for the king', 'the outpost', 'the shannara chronicles', 'mythic quest', 'upload ',
  'avenue 5', 'space force', 'resident alien', 'superstore', 'great news', 'speechless',
  'everything sucks', 'atypical', 'on my block', 'never have i ever', 'grand army', 'dash and lily',
  'trinkets', 'the society', 'the wilds', 'panic ', 'cruel summer', 'yellowjackets',
];
export const EASY_KEYWORDS = [
  'game of thrones', 'house of the dragon', 'breaking bad', 'better call saul', 'stranger things', 'the witcher',
  'mandalorian', 'andor', 'star wars', 'marvel', 'loki', 'wandavision',
  'falcon', 'hawkeye', 'moon knight', 'she-hulk', 'ms marvel', 'secret invasion',
  'the office', 'friends', 'how i met', 'big bang theory', 'modern family', 'parks and rec',
  'brooklyn nine', 'seinfeld', 'simpsons', 'family guy', 'south park', 'rick and morty',
  'futurama', 'the boys', 'invincible', 'the walking dead', 'greys anatomy', 'criminal minds',
  'ncis', 'law and order', 'csi', 'the 100', 'supernatural', 'arrow',
  'flash', 'supergirl', 'legends of tomorrow', 'batwoman', 'gotham', 'titans',
  'doom patrol', 'peacemaker', 'lucifer', 'the sandman', 'good omens', 'american gods',
  'the expanse', 'for all mankind', 'foundation', 'wheel of time', 'lord of the rings', 'rings of power',
  'true detective', 'fargo ', 'ozark', 'narcos', 'peaky blinders', 'money heist',
  'squid game', 'bridgerton', 'queens gambit', 'wednesday', 'cobra kai', 'you ',
  'emily in paris', 'virgin river', 'outer banks', 'euphoria', 'succession', 'white lotus',
  'last of us', 'yellowstone', 'ted lasso', 'severance', 'shogun', 'house of cards',
  'black mirror', 'handmaid', 'westworld', 'mr robot', 'silicon valley', 'veep',
  'curb your', 'barry', 'hacks', 'only murders', 'the bear', 'the crown',
  'downton abbey', 'outlander', 'vikings', 'the last kingdom', 'spartacus', 'rome ',
  'band of brothers', 'chernobyl', 'the night of', 'mare of easttown', 'dopesick', 'station eleven',
  'under the banner', 'dahmer', 'monster', 'waco', 'mindhunter', 'dexter',
  'hannibal', 'bates motel', 'killing eve', 'homeland', 'jack ryan', 'reacher',
  'terminal list', 'the night agent', 'citadel', 'berlin', 'one piece', 'attack on titan',
  'demon slayer', 'jujutsu kaisen', 'dragon ball', 'naruto', 'one punch', 'my hero academia',
  'death note', 'fullmetal', 'hunter x hunter', 'spy x family', 'pokemon', 'doctor who',
  'sherlock', 'the sopranos', 'the wire', 'mad men', 'lost', 'prison break',
  'suits', '24 ', 'alias',
];
export const PRIORITY_LEVELS = [
  { value: 0, label: 'Critical', color: 'red', description: 'Irreplaceable personal files' },
  { value: 1, label: 'High', color: 'orange', description: 'Rare media, important documents' },
  { value: 2, label: 'Medium', color: 'yellow', description: 'Moderate rarity media' },
  { value: 3, label: 'Low', color: 'blue', description: 'Easy to find again' },
  { value: 4, label: 'Optional', color: 'gray', description: 'Nice to have, not critical' },
];

export function scoreRarity(title: string): { score: number; rarity: string } {
  const lower = title.toLowerCase();
  
  for (const keyword of RARE_KEYWORDS) {
    if (lower.includes(keyword.trim().toLowerCase())) {
      return { score: 85, rarity: 'rare' };
    }
  }
  
  for (const keyword of EASY_KEYWORDS) {
    if (lower.includes(keyword.trim().toLowerCase())) {
      return { score: 15, rarity: 'easy' };
    }
  }
  
  return { score: 50, rarity: 'moderate' };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
