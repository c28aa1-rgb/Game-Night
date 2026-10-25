// The built-in songbook: names only, no audio. Picking a song finds a karaoke video on YouTube.
// [title, artist, year, genre, duet?]
const RAW = [
  ["Bohemian Rhapsody", "Queen", 1975, "Rock"],
  ["Don't Stop Me Now", "Queen", 1978, "Rock"],
  ["Somebody to Love", "Queen", 1976, "Rock"],
  ["Dancing Queen", "ABBA", 1976, "Pop"],
  ["Mamma Mia", "ABBA", 1975, "Pop"],
  ["Waterloo", "ABBA", 1974, "Pop"],
  ["I Will Survive", "Gloria Gaynor", 1978, "Disco"],
  ["September", "Earth, Wind & Fire", 1978, "Disco"],
  ["Le Freak", "Chic", 1978, "Disco"],
  ["Stayin' Alive", "Bee Gees", 1977, "Disco"],
  ["Respect", "Aretha Franklin", 1967, "Soul"],
  ["Ain't No Mountain High Enough", "Marvin Gaye & Tammi Terrell", 1967, "Soul", true],
  ["My Girl", "The Temptations", 1964, "Soul"],
  ["Stand by Me", "Ben E. King", 1961, "Soul"],
  ["Superstition", "Stevie Wonder", 1972, "Soul"],
  ["Hey Jude", "The Beatles", 1968, "Rock"],
  ["Let It Be", "The Beatles", 1970, "Rock"],
  ["Twist and Shout", "The Beatles", 1963, "Rock"],
  ["Sweet Caroline", "Neil Diamond", 1969, "Pop"],
  ["Piano Man", "Billy Joel", 1973, "Rock"],
  ["Tiny Dancer", "Elton John", 1971, "Rock"],
  ["Your Song", "Elton John", 1970, "Pop"],
  ["Don't Go Breaking My Heart", "Elton John & Kiki Dee", 1976, "Pop", true],
  ["Go Your Own Way", "Fleetwood Mac", 1977, "Rock"],
  ["Dreams", "Fleetwood Mac", 1977, "Rock"],
  ["Hotel California", "Eagles", 1976, "Rock"],
  ["Jolene", "Dolly Parton", 1973, "Country"],
  ["9 to 5", "Dolly Parton", 1980, "Country"],
  ["Islands in the Stream", "Kenny Rogers & Dolly Parton", 1983, "Country", true],
  ["Take Me Home, Country Roads", "John Denver", 1971, "Country"],
  ["Man! I Feel Like a Woman!", "Shania Twain", 1997, "Country"],
  ["Before He Cheats", "Carrie Underwood", 2005, "Country"],
  ["Friends in Low Places", "Garth Brooks", 1990, "Country"],
  ["Livin' on a Prayer", "Bon Jovi", 1986, "Rock"],
  ["Don't Stop Believin'", "Journey", 1981, "Rock"],
  ["Total Eclipse of the Heart", "Bonnie Tyler", 1983, "Rock"],
  ["Africa", "Toto", 1982, "Rock"],
  ["Eye of the Tiger", "Survivor", 1982, "Rock"],
  ["Sweet Child O' Mine", "Guns N' Roses", 1987, "Rock"],
  ["Here I Go Again", "Whitesnake", 1987, "Rock"],
  ["Girls Just Want to Have Fun", "Cyndi Lauper", 1983, "Pop"],
  ["Time After Time", "Cyndi Lauper", 1984, "Pop"],
  ["Like a Prayer", "Madonna", 1989, "Pop"],
  ["Material Girl", "Madonna", 1984, "Pop"],
  ["I Wanna Dance with Somebody", "Whitney Houston", 1987, "Pop"],
  ["I Will Always Love You", "Whitney Houston", 1992, "R&B"],
  ["Billie Jean", "Michael Jackson", 1982, "Pop"],
  ["Man in the Mirror", "Michael Jackson", 1987, "Pop"],
  ["Take On Me", "a-ha", 1985, "Pop"],
  ["Don't You (Forget About Me)", "Simple Minds", 1985, "Rock"],
  ["Never Gonna Give You Up", "Rick Astley", 1987, "Pop"],
  ["Walking on Sunshine", "Katrina and the Waves", 1985, "Pop"],
  ["Purple Rain", "Prince", 1984, "Rock"],
  ["Kiss", "Prince", 1986, "Pop"],
  ["Like a Virgin", "Madonna", 1984, "Pop"],
  ["(I've Had) The Time of My Life", "Bill Medley & Jennifer Warnes", 1987, "Musicals & Film", true],
  ["Footloose", "Kenny Loggins", 1984, "Musicals & Film"],
  ["You're the One That I Want", "John Travolta & Olivia Newton-John", 1978, "Musicals & Film", true],
  ["Summer Nights", "John Travolta & Olivia Newton-John", 1978, "Musicals & Film", true],
  ["Wannabe", "Spice Girls", 1996, "Pop"],
  ["...Baby One More Time", "Britney Spears", 1998, "Pop"],
  ["Toxic", "Britney Spears", 2003, "Pop"],
  ["I Want It That Way", "Backstreet Boys", 1999, "Pop"],
  ["Bye Bye Bye", "*NSYNC", 2000, "Pop"],
  ["Genie in a Bottle", "Christina Aguilera", 1999, "Pop"],
  ["My Heart Will Go On", "Céline Dion", 1997, "Musicals & Film"],
  ["Wonderwall", "Oasis", 1995, "Rock"],
  ["Don't Look Back in Anger", "Oasis", 1995, "Rock"],
  ["Mr. Brightside", "The Killers", 2003, "Rock"],
  ["Smells Like Teen Spirit", "Nirvana", 1991, "Rock"],
  ["Zombie", "The Cranberries", 1994, "Rock"],
  ["Losing My Religion", "R.E.M.", 1991, "Rock"],
  ["You Oughta Know", "Alanis Morissette", 1995, "Rock"],
  ["Ironic", "Alanis Morissette", 1995, "Rock"],
  ["No Scrubs", "TLC", 1999, "R&B"],
  ["Waterfalls", "TLC", 1994, "R&B"],
  ["Say My Name", "Destiny's Child", 1999, "R&B"],
  ["Crazy in Love", "Beyoncé", 2003, "R&B"],
  ["Single Ladies (Put a Ring on It)", "Beyoncé", 2008, "R&B"],
  ["Halo", "Beyoncé", 2008, "R&B"],
  ["Hey Ya!", "OutKast", 2003, "Hip-Hop"],
  ["Lose Yourself", "Eminem", 2002, "Hip-Hop"],
  ["Gangsta's Paradise", "Coolio", 1995, "Hip-Hop"],
  ["Ice Ice Baby", "Vanilla Ice", 1990, "Hip-Hop"],
  ["Fresh Prince of Bel-Air Theme", "Will Smith", 1990, "Hip-Hop"],
  ["Super Bass", "Nicki Minaj", 2010, "Hip-Hop"],
  ["Since U Been Gone", "Kelly Clarkson", 2004, "Pop"],
  ["Complicated", "Avril Lavigne", 2002, "Pop"],
  ["Sk8er Boi", "Avril Lavigne", 2002, "Rock"],
  ["Hollaback Girl", "Gwen Stefani", 2005, "Pop"],
  ["Umbrella", "Rihanna ft. Jay-Z", 2007, "R&B"],
  ["We Found Love", "Rihanna ft. Calvin Harris", 2011, "Pop"],
  ["Bad Romance", "Lady Gaga", 2009, "Pop"],
  ["Poker Face", "Lady Gaga", 2008, "Pop"],
  ["Shallow", "Lady Gaga & Bradley Cooper", 2018, "Musicals & Film", true],
  ["Rolling in the Deep", "Adele", 2010, "Pop"],
  ["Someone Like You", "Adele", 2011, "Pop"],
  ["Hello", "Adele", 2015, "Pop"],
  ["Teenage Dream", "Katy Perry", 2010, "Pop"],
  ["Firework", "Katy Perry", 2010, "Pop"],
  ["Call Me Maybe", "Carly Rae Jepsen", 2011, "Pop"],
  ["Party in the U.S.A.", "Miley Cyrus", 2009, "Pop"],
  ["Wrecking Ball", "Miley Cyrus", 2013, "Pop"],
  ["Flowers", "Miley Cyrus", 2023, "Pop"],
  ["Love Story", "Taylor Swift", 2008, "Country"],
  ["You Belong with Me", "Taylor Swift", 2008, "Pop"],
  ["Shake It Off", "Taylor Swift", 2014, "Pop"],
  ["Blank Space", "Taylor Swift", 2014, "Pop"],
  ["Anti-Hero", "Taylor Swift", 2022, "Pop"],
  ["Cruel Summer", "Taylor Swift", 2019, "Pop"],
  ["Uptown Funk", "Mark Ronson ft. Bruno Mars", 2014, "Pop"],
  ["Just the Way You Are", "Bruno Mars", 2010, "Pop"],
  ["Locked Out of Heaven", "Bruno Mars", 2012, "Pop"],
  ["Die with a Smile", "Lady Gaga & Bruno Mars", 2024, "Pop", true],
  ["Happy", "Pharrell Williams", 2013, "Pop"],
  ["Shut Up and Dance", "Walk the Moon", 2014, "Rock"],
  ["Shape of You", "Ed Sheeran", 2017, "Pop"],
  ["Perfect", "Ed Sheeran", 2017, "Pop"],
  ["Let It Go", "Idina Menzel", 2013, "Musicals & Film"],
  ["A Whole New World", "Lea Salonga & Brad Kane", 1992, "Musicals & Film", true],
  ["Under the Sea", "Samuel E. Wright", 1989, "Musicals & Film"],
  ["How Far I'll Go", "Auli'i Cravalho", 2016, "Musicals & Film"],
  ["We Don't Talk About Bruno", "Encanto Cast", 2021, "Musicals & Film"],
  ["This Is Me", "Keala Settle", 2017, "Musicals & Film"],
  ["The Greatest Show", "Hugh Jackman", 2017, "Musicals & Film"],
  ["Defying Gravity", "Idina Menzel & Kristin Chenoweth", 2003, "Musicals & Film", true],
  ["Popular", "Kristin Chenoweth", 2003, "Musicals & Film"],
  ["My Shot", "Hamilton Cast", 2015, "Musicals & Film"],
  ["City of Stars", "Ryan Gosling & Emma Stone", 2016, "Musicals & Film", true],
  ["Golden", "Huntrix", 2025, "Musicals & Film"],
  ["Bad Guy", "Billie Eilish", 2019, "Pop"],
  ["Birds of a Feather", "Billie Eilish", 2024, "Pop"],
  ["Levitating", "Dua Lipa", 2020, "Pop"],
  ["Don't Start Now", "Dua Lipa", 2019, "Pop"],
  ["Blinding Lights", "The Weeknd", 2019, "Pop"],
  ["drivers license", "Olivia Rodrigo", 2021, "Pop"],
  ["good 4 u", "Olivia Rodrigo", 2021, "Rock"],
  ["vampire", "Olivia Rodrigo", 2023, "Pop"],
  ["As It Was", "Harry Styles", 2022, "Pop"],
  ["Watermelon Sugar", "Harry Styles", 2019, "Pop"],
  ["Espresso", "Sabrina Carpenter", 2024, "Pop"],
  ["Please Please Please", "Sabrina Carpenter", 2024, "Pop"],
  ["Good Luck, Babe!", "Chappell Roan", 2024, "Pop"],
  ["HOT TO GO!", "Chappell Roan", 2023, "Pop"],
  ["APT.", "ROSÉ & Bruno Mars", 2024, "Pop", true],
  ["Dynamite", "BTS", 2020, "Pop"],
  ["Physical", "Dua Lipa", 2020, "Pop"],
  ["Valerie", "Amy Winehouse", 2007, "Soul"],
  ["Rehab", "Amy Winehouse", 2006, "Soul"],
  ["Mercy", "Duffy", 2008, "Soul"],
  ["I Gotta Feeling", "The Black Eyed Peas", 2009, "Pop"],
  ["Dancing on My Own", "Robyn", 2010, "Pop"],
  ["Seven Nation Army", "The White Stripes", 2003, "Rock"],
  ["Use Somebody", "Kings of Leon", 2008, "Rock"],
  ["Chasing Cars", "Snow Patrol", 2006, "Rock"],
  ["Fix You", "Coldplay", 2005, "Rock"],
  ["Viva la Vida", "Coldplay", 2008, "Rock"],
  ["Yellow", "Coldplay", 2000, "Rock"],
  ["Basket Case", "Green Day", 1994, "Rock"],
  ["All the Small Things", "blink-182", 1999, "Rock"],
  ["Welcome to the Black Parade", "My Chemical Romance", 2006, "Rock"],
  ["Misery Business", "Paramore", 2007, "Rock"],
  ["Livin' la Vida Loca", "Ricky Martin", 1999, "Pop"],
  ["Despacito", "Luis Fonsi ft. Daddy Yankee", 2017, "Pop"],
  ["Hips Don't Lie", "Shakira ft. Wyclef Jean", 2006, "Pop"],
  ["Barbie Girl", "Aqua", 1997, "Dance"],
  ["What Is Love", "Haddaway", 1993, "Dance"],
  ["Rhythm Is a Dancer", "Snap!", 1992, "Dance"],
  ["Murder on the Dancefloor", "Sophie Ellis-Bextor", 2001, "Dance"],
  ["Can't Get You Out of My Head", "Kylie Minogue", 2001, "Dance"],
  ["Believe", "Cher", 1998, "Dance"],
  ["Y.M.C.A.", "Village People", 1978, "Disco"],
  ["Proud Mary", "Tina Turner", 1971, "Rock"],
  ["What's Love Got to Do with It", "Tina Turner", 1984, "Pop"],
  ["(You Make Me Feel Like) A Natural Woman", "Aretha Franklin", 1967, "Soul"],
  ["Fly Me to the Moon", "Frank Sinatra", 1964, "Jazz & Standards"],
  ["New York, New York", "Frank Sinatra", 1980, "Jazz & Standards"],
  ["My Way", "Frank Sinatra", 1969, "Jazz & Standards"],
  ["Feeling Good", "Michael Bublé", 2005, "Jazz & Standards"],
  ["Can't Help Falling in Love", "Elvis Presley", 1961, "Rock"],
  ["Suspicious Minds", "Elvis Presley", 1969, "Rock"],
  ["Johnny B. Goode", "Chuck Berry", 1958, "Rock"],
  ["Ring of Fire", "Johnny Cash", 1963, "Country"],
  ["Jackson", "Johnny Cash & June Carter", 1967, "Country", true],
  ["Achy Breaky Heart", "Billy Ray Cyrus", 1992, "Country"],
  ["Tennessee Whiskey", "Chris Stapleton", 2015, "Country"],
  ["Texas Hold 'Em", "Beyoncé", 2024, "Country"],
  ["All I Want for Christmas Is You", "Mariah Carey", 1994, "Holiday"],
  ["Last Christmas", "Wham!", 1984, "Holiday"],
  ["Baby, It's Cold Outside", "Idina Menzel & Michael Bublé", 2014, "Holiday", true],
  ["Rockin' Around the Christmas Tree", "Brenda Lee", 1958, "Holiday"],
  // Disney, film & stage: karaoke favourites the pop charts mostly missed.
  ["Part of Your World", "Jodi Benson", 1989, "Musicals & Film"],
  ["Kiss the Girl", "Samuel E. Wright", 1989, "Musicals & Film"],
  ["Be Our Guest", "Jerry Orbach & Angela Lansbury", 1991, "Musicals & Film", true],
  ["Beauty and the Beast", "Angela Lansbury", 1991, "Musicals & Film"],
  ["Friend Like Me", "Robin Williams", 1992, "Musicals & Film"],
  ["Circle of Life", "Carmen Twillie & Lebo M.", 1994, "Musicals & Film"],
  ["Hakuna Matata", "Nathan Lane & Ernie Sabella", 1994, "Musicals & Film", true],
  ["I Just Can't Wait to Be King", "Jason Weaver", 1994, "Musicals & Film"],
  ["Can You Feel the Love Tonight", "Elton John", 1994, "Musicals & Film"],
  ["Colors of the Wind", "Judy Kuhn", 1995, "Musicals & Film"],
  ["You've Got a Friend in Me", "Randy Newman", 1995, "Musicals & Film"],
  ["Go the Distance", "Roger Bart", 1997, "Musicals & Film"],
  ["I Won't Say (I'm in Love)", "Susan Egan", 1997, "Musicals & Film"],
  ["Reflection", "Lea Salonga", 1998, "Musicals & Film"],
  ["I'll Make a Man Out of You", "Donny Osmond", 1998, "Musicals & Film"],
  ["Almost There", "Anika Noni Rose", 2009, "Musicals & Film"],
  ["When Will My Life Begin", "Mandy Moore", 2010, "Musicals & Film"],
  ["I See the Light", "Mandy Moore & Zachary Levi", 2010, "Musicals & Film", true],
  ["Do You Want to Build a Snowman?", "Kristen Bell", 2013, "Musicals & Film"],
  ["For the First Time in Forever", "Kristen Bell & Idina Menzel", 2013, "Musicals & Film", true],
  ["Love Is an Open Door", "Kristen Bell & Santino Fontana", 2013, "Musicals & Film", true],
  ["You're Welcome", "Dwayne Johnson", 2016, "Musicals & Film"],
  ["Remember Me", "Benjamin Bratt", 2017, "Musicals & Film"],
  ["Into the Unknown", "Idina Menzel & AURORA", 2019, "Musicals & Film", true],
  ["Show Yourself", "Idina Menzel & Evan Rachel Wood", 2019, "Musicals & Film", true],
  ["Surface Pressure", "Jessica Darrow", 2021, "Musicals & Film"],
  ["Breaking Free", "Zac Efron & Vanessa Hudgens", 2006, "Musicals & Film", true],
  ["Start of Something New", "Zac Efron & Vanessa Hudgens", 2006, "Musicals & Film", true],
  ["We're All in This Together", "High School Musical Cast", 2006, "Musicals & Film"],
  ["A Million Dreams", "Ziv Zaifman, Hugh Jackman & Michelle Williams", 2017, "Musicals & Film"],
  ["Rewrite the Stars", "Zac Efron & Zendaya", 2017, "Musicals & Film", true],
  ["Never Enough", "Loren Allred", 2017, "Musicals & Film"],
  ["Over the Rainbow", "Judy Garland", 1939, "Musicals & Film"],
  ["Hopelessly Devoted to You", "Olivia Newton-John", 1978, "Musicals & Film"],
  ["Grease Lightnin'", "John Travolta", 1978, "Musicals & Film"],
  ["Time Warp", "The Rocky Horror Picture Show Cast", 1975, "Musicals & Film"],
  ["Don't Rain on My Parade", "Barbra Streisand", 1968, "Musicals & Film"],
  ["Cabaret", "Liza Minnelli", 1972, "Musicals & Film"],
  ["Memory", "Elaine Paige", 1981, "Musicals & Film"],
  ["Seasons of Love", "Rent Cast", 1996, "Musicals & Film"],
  ["I Dreamed a Dream", "Anne Hathaway", 2012, "Musicals & Film"],
  ["On My Own", "Samantha Barks", 2012, "Musicals & Film"],
  ["One Day More", "Les Misérables Cast", 2012, "Musicals & Film"],
  ["Wait for It", "Leslie Odom Jr.", 2015, "Musicals & Film"],
  ["Satisfied", "Renée Elise Goldsberry", 2015, "Musicals & Film"],
  ["You'll Be Back", "Jonathan Groff", 2015, "Musicals & Film"],
  ["The Schuyler Sisters", "Hamilton Cast", 2015, "Musicals & Film"],
  ["Waving Through a Window", "Ben Platt", 2015, "Musicals & Film"],
  ["For Good", "Idina Menzel & Kristin Chenoweth", 2003, "Musicals & Film", true],
  ["Dancing Through Life", "Norbert Leo Butz", 2003, "Musicals & Film"],
  ["What Was I Made For?", "Billie Eilish", 2023, "Musicals & Film"],
  ["I'm Just Ken", "Ryan Gosling", 2023, "Musicals & Film"],
  ["Soda Pop", "Saja Boys", 2025, "Musicals & Film"],
  ["How It's Done", "Huntrix", 2025, "Musicals & Film"],
  ["What It Sounds Like", "Huntrix", 2025, "Musicals & Film"],
  // Holiday
  ["Jingle Bell Rock", "Bobby Helms", 1957, "Holiday"],
  ["Feliz Navidad", "José Feliciano", 1970, "Holiday"],
  ["A Holly Jolly Christmas", "Burl Ives", 1964, "Holiday"],
  ["It's Beginning to Look a Lot Like Christmas", "Michael Bublé", 2011, "Holiday"],
  ["Underneath the Tree", "Kelly Clarkson", 2013, "Holiday"],
  ["Santa Tell Me", "Ariana Grande", 2014, "Holiday"],
  ["Mistletoe", "Justin Bieber", 2011, "Holiday"],
  ["Happy Xmas (War Is Over)", "John Lennon & Yoko Ono", 1971, "Holiday"],
];

export function norm(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Songbook order ignores leading punctuation: "(I've Had) The Time…" files under I.
export function sortTitle(t) {
  return t.replace(/^[^a-z0-9]+/i, "");
}

// Same song, any version: drop "(Remastered)" etc. and featured/second artists. Must match scripts/build-songbook.mjs.
export function songKey(title, artist) {
  const lead = norm(artist.split(":")[0]).split(/ (?:featuring|feat|ft|with|and|x) /)[0];
  return `${norm(title.replace(/\s*[([].*?[)\]]\s*/g, " "))}|${lead}`;
}

export function decadeOf(year) {
  if (!year) return null;
  const d = Math.floor(year / 10) * 10;
  return d < 2000 ? `${String(d).slice(2)}s` : `${d}s`;
}

// Karaoke staples get a boost so they sit near the top even if they charted modestly.
const CLASSIC_BOOST = 160;

function makeSong({ title, artist, year, genre = "", duet = false, score = 0, classic = false }) {
  return {
    key: songKey(title, artist),
    title,
    artist,
    year,
    genre,
    duet,
    score,
    classic,
    source: "songbook",
    words: norm(`${title} ${artist}`).split(" "),
    titleNorm: norm(title),
  };
}

const CLASSICS = RAW.map(([title, artist, year, genre, duet]) =>
  makeSong({ title, artist, year, genre, duet: Boolean(duet), score: CLASSIC_BOOST, classic: true })
);

// Starts as the classics; the full chart songbook (~6,400 songs) loads lazily on top.
export let LIBRARY = [...CLASSICS].sort((a, b) => b.score - a.score);

let loading;
export function loadSongbook() {
  loading ??= import("../data/songbook.json").then(({ default: rows }) => {
    const byKey = new Map();
    for (const [title, artist, year, score, duet] of rows) {
      const s = makeSong({ title, artist, year, score, duet: Boolean(duet) });
      if (!byKey.has(s.key)) byKey.set(s.key, s);
    }
    for (const c of CLASSICS) {
      const chart = byKey.get(c.key);
      byKey.set(c.key, chart ? { ...c, year: Math.min(c.year, chart.year), score: chart.score + CLASSIC_BOOST, duet: c.duet || chart.duet } : c);
    }
    LIBRARY = [...byKey.values()].sort((a, b) => b.score - a.score);
    return LIBRARY;
  });
  return loading;
}

export const FILTERS = [
  { id: "all", label: "All songs" },
  { id: "classics", label: "Karaoke classics", test: (s) => s.classic },
  { id: "duet", label: "Duets", test: (s) => s.duet },
  { id: "film", label: "Musicals & Film", test: (s) => s.genre === "Musicals & Film" },
  { id: "holiday", label: "Holiday", test: (s) => s.genre === "Holiday" || /christmas|santa|jingle|sleigh|holiday|snow/i.test(s.title) },
  ...["60s", "70s", "80s", "90s", "2000s", "2010s", "2020s"].map((d) => ({ id: d, label: d, test: (s) => decadeOf(s.year) === d })),
];

// Typo-tolerant word match: exact (3), prefix (2), one edit away (1), else 0.
function within1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
      i += 2; // swapped letters
      j += 2;
    } else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
function wordScore(token, words) {
  let best = 0;
  for (const w of words) {
    if (w === token) return 3;
    if (w.startsWith(token)) best = Math.max(best, 2);
    else if (token.length >= 5 && (within1(w, token) || (w.length > token.length && within1(w.slice(0, token.length), token)))) best = Math.max(best, 1);
  }
  return best;
}

export function matchScore(song, q, tokens) {
  let total = 0;
  for (const t of tokens) {
    const sc = wordScore(t, song.words);
    if (!sc) return 0;
    total += sc;
  }
  if (song.titleNorm === q) total += 12;
  else if (song.titleNorm.startsWith(q)) total += 6;
  return total;
}

export function searchLibrary(query, filterId = "all", sort = "popular") {
  const f = FILTERS.find((x) => x.id === filterId);
  const list = f?.test ? LIBRARY.filter(f.test) : LIBRARY;
  const q = norm(query);
  if (!q) {
    return sort === "az" ? [...list].sort((a, b) => sortTitle(a.title).localeCompare(sortTitle(b.title))) : list;
  }
  const tokens = q.split(" ");
  const hits = [];
  for (const s of list) {
    const m = matchScore(s, q, tokens);
    if (m) hits.push([m * 1000 + s.score, s]);
  }
  return hits.sort((a, b) => b[0] - a[0]).map((h) => h[1]);
}
