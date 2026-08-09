// 300 additional, hand-curated Pop Music cards. Spotify ids are intentionally
// resolved by the existing /hitster/resolve flow, which checks every title and
// artist against the signed-in account instead of guessing track ids.
const rows = `
Stand by Me|Ben E. King|1961
Runaway|Del Shannon|1961
Be My Baby|The Ronettes|1963
Then He Kissed Me|The Crystals|1963
I Want to Hold Your Hand|The Beatles|1963
You Really Got Me|The Kinks|1964
The House of the Rising Sun|The Animals|1964
You've Lost That Lovin' Feelin'|The Righteous Brothers|1964
My Girl|The Temptations|1964
Stop! In the Name of Love|The Supremes|1965
California Dreamin'|The Mamas & the Papas|1965
I'm a Believer|The Monkees|1966
Respect|Aretha Franklin|1967
Ain't No Mountain High Enough|Marvin Gaye & Tammi Terrell|1967
Piece of My Heart|Big Brother & the Holding Company|1968
Build Me Up Buttercup|The Foundations|1968
Son of a Preacher Man|Dusty Springfield|1968
Sweet Caroline|Neil Diamond|1969
I Want You Back|The Jackson 5|1969
Crimson and Clover|Tommy James & the Shondells|1968
Good Vibrations|The Beach Boys|1966
Wouldn't It Be Nice|The Beach Boys|1966
Mrs. Robinson|Simon & Garfunkel|1968
The Sound of Silence|Simon & Garfunkel|1965
Sugar, Sugar|The Archies|1969
The Weight|The Band|1968
These Eyes|The Guess Who|1969
Spinning Wheel|Blood, Sweat & Tears|1968
For What It's Worth|Buffalo Springfield|1966
Happy Together|The Turtles|1967
American Pie|Don McLean|1971
Let's Stay Together|Al Green|1971
Superstition|Stevie Wonder|1972
Killing Me Softly with His Song|Roberta Flack|1973
You're So Vain|Carly Simon|1972
Dancing in the Moonlight|King Harvest|1972
Goodbye Yellow Brick Road|Elton John|1973
The Joker|Steve Miller Band|1973
You're the First, the Last, My Everything|Barry White|1974
Dreams|Fleetwood Mac|1977
Go Your Own Way|Fleetwood Mac|1977
Rich Girl|Daryl Hall & John Oates|1976
More Than a Feeling|Boston|1976
Mr. Blue Sky|Electric Light Orchestra|1977
Easy|Commodores|1977
Hot Stuff|Donna Summer|1979
Le Freak|Chic|1978
I Will Survive|Gloria Gaynor|1978
Heart of Glass|Blondie|1978
September|Earth, Wind & Fire|1978
We Are Family|Sister Sledge|1979
Y.M.C.A.|Village People|1978
Escape (The Pina Colada Song)|Rupert Holmes|1979
Video Killed the Radio Star|The Buggles|1979
My Sharona|The Knack|1979
Don't Stop 'Til You Get Enough|Michael Jackson|1979
Take a Chance on Me|ABBA|1977
Waterloo|ABBA|1974
The Boys Are Back in Town|Thin Lizzy|1976
Baker Street|Gerry Rafferty|1978
Call Me|Blondie|1980
Celebration|Kool & the Gang|1980
Another One Bites the Dust|Queen|1980
Crazy Little Thing Called Love|Queen|1979
Tainted Love|Soft Cell|1981
Don't You Want Me|The Human League|1981
Africa|Toto|1982
Rosanna|Toto|1982
I Love Rock 'n Roll|Joan Jett & the Blackhearts|1981
Maneater|Daryl Hall & John Oates|1982
Girls Just Want to Have Fun|Cyndi Lauper|1983
Time After Time|Cyndi Lauper|1983
True|Spandau Ballet|1983
The Power of Love|Huey Lewis & the News|1985
Wake Me Up Before You Go-Go|Wham!|1984
Faith|George Michael|1987
Careless Whisper|George Michael|1984
Take On Me|a-ha|1985
Everybody Wants to Rule the World|Tears for Fears|1985
Shout|Tears for Fears|1984
Head Over Heels|Tears for Fears|1985
Livin' on a Prayer|Bon Jovi|1986
You Give Love a Bad Name|Bon Jovi|1986
Heaven|Bryan Adams|1984
Summer of '69|Bryan Adams|1984
The Boys of Summer|Don Henley|1984
Every Breath You Take|The Police|1983
Walking on Sunshine|Katrina and the Waves|1983
Sweet Dreams (Are Made of This)|Eurythmics|1983
Here I Go Again|Whitesnake|1987
Nothing's Gonna Stop Us Now|Starship|1987
Eternal Flame|The Bangles|1988
I Wanna Dance with Somebody|Whitney Houston|1987
How Will I Know|Whitney Houston|1985
Fast Car|Tracy Chapman|1988
Smooth Criminal|Michael Jackson|1987
Man in the Mirror|Michael Jackson|1987
The Way You Make Me Feel|Michael Jackson|1987
Like a Virgin|Madonna|1984
Material Girl|Madonna|1984
Into the Groove|Madonna|1985
Papa Don't Preach|Madonna|1986
Tell It to My Heart|Taylor Dayne|1987
Holding Back the Years|Simply Red|1985
The Reflex|Duran Duran|1984
Hungry Like the Wolf|Duran Duran|1982
Rio|Duran Duran|1982
Need You Tonight|INXS|1987
The Look|Roxette|1988
It Must Have Been Love|Roxette|1987
Total Eclipse of the Heart|Bonnie Tyler|1983
Heaven Is a Place on Earth|Belinda Carlisle|1987
The Promise|When In Rome|1988
St. Elmo's Fire (Man in Motion)|John Parr|1985
Take My Breath Away|Berlin|1986
Human|The Human League|1986
Missing You|John Waite|1984
The Living Years|Mike + The Mechanics|1988
Broken Wings|Mr. Mister|1985
99 Luftballons|Nena|1983
Vogue|Madonna|1990
Freedom! '90|George Michael|1990
Black or White|Michael Jackson|1991
End of the Road|Boyz II Men|1992
No Scrubs|TLC|1999
Waterfalls|TLC|1994
Creep|TLC|1994
Un-Break My Heart|Toni Braxton|1996
I Want It That Way|Backstreet Boys|1999
...Baby One More Time|Britney Spears|1998
Genie in a Bottle|Christina Aguilera|1999
If You Had My Love|Jennifer Lopez|1999
Believe|Cher|1998
Torn|Natalie Imbruglia|1997
Iris|Goo Goo Dolls|1998
Kiss Me|Sixpence None the Richer|1997
You Oughta Know|Alanis Morissette|1995
Bitch|Meredith Brooks|1997
Save Tonight|Eagle-Eye Cherry|1997
Steal My Sunshine|Len|1999
What's Up?|4 Non Blondes|1992
All Star|Smash Mouth|1999
Semi-Charmed Life|Third Eye Blind|1997
Closing Time|Semisonic|1998
The Boy Is Mine|Brandy & Monica|1998
I Don't Want to Wait|Paula Cole|1996
The Sign|Ace of Base|1993
All That She Wants|Ace of Base|1992
Return of the Mack|Mark Morrison|1996
This Is How We Do It|Montell Jordan|1995
Pony|Ginuwine|1996
No Diggity|Blackstreet|1996
C'est la Vie|B*Witched|1998
MMMBop|Hanson|1997
Everybody (Backstreet's Back)|Backstreet Boys|1997
Show Me Love|Robin S.|1993
Rhythm Is a Dancer|Snap!|1992
Gonna Make You Sweat|C+C Music Factory|1990
Finally|CeCe Peniston|1991
I'm Too Sexy|Right Said Fred|1991
Baby, I Love Your Way|Big Mountain|1994
Fade Into You|Mazzy Star|1993
Song 2|Blur|1997
You Learn|Alanis Morissette|1995
You Get What You Give|New Radicals|1998
I'll Be There for You|The Rembrandts|1995
Breakfast at Tiffany's|Deep Blue Something|1995
3AM|Matchbox Twenty|1996
Sex and Candy|Marcy Playground|1997
One Week|Barenaked Ladies|1998
Tubthumping|Chumbawamba|1997
The Freshmen|The Verve Pipe|1996
One Headlight|The Wallflowers|1996
You Were Meant for Me|Jewel|1995
Ironic|Alanis Morissette|1995
Just a Girl|No Doubt|1995
Don't Speak|No Doubt|1996
Bitter Sweet Symphony|The Verve|1997
Linger|The Cranberries|1993
Zombie|The Cranberries|1994
Oops!... I Did It Again|Britney Spears|2000
Toxic|Britney Spears|2003
Crazy in Love|Beyoncé|2003
Halo|Beyoncé|2008
Umbrella|Rihanna|2007
Disturbia|Rihanna|2008
Just Dance|Lady Gaga|2008
Poker Face|Lady Gaga|2008
Paparazzi|Lady Gaga|2009
Bad Romance|Lady Gaga|2009
Firework|Katy Perry|2010
Teenage Dream|Katy Perry|2010
California Gurls|Katy Perry|2010
Hot n Cold|Katy Perry|2008
Since U Been Gone|Kelly Clarkson|2004
Behind These Hazel Eyes|Kelly Clarkson|2005
Complicated|Avril Lavigne|2002
Sk8er Boi|Avril Lavigne|2002
A Thousand Miles|Vanessa Carlton|2002
Breathe (2 AM)|Anna Nalick|2004
The Middle|Jimmy Eat World|2001
Stacy's Mom|Fountains of Wayne|2003
Hey There Delilah|Plain White T's|2006
1985|Bowling for Soup|2004
The Reason|Hoobastank|2003
Bad Day|Daniel Powter|2005
Beautiful Soul|Jesse McCartney|2004
A Moment Like This|Kelly Clarkson|2002
Leave (Get Out)|JoJo|2004
So What|P!nk|2008
Hips Don't Lie|Shakira|2006
Whenever, Wherever|Shakira|2001
The Sweet Escape|Gwen Stefani|2006
Hollaback Girl|Gwen Stefani|2004
Love Story|Taylor Swift|2008
You Belong with Me|Taylor Swift|2008
Teardrops on My Guitar|Taylor Swift|2006
Bleeding Love|Leona Lewis|2007
Apologize|Timbaland feat. OneRepublic|2007
Pocketful of Sunshine|Natasha Bedingfield|2007
Love Song|Sara Bareilles|2007
Crush|David Archuleta|2008
Bubbly|Colbie Caillat|2007
Put Your Records On|Corinne Bailey Rae|2006
Mercy|Duffy|2008
Chasing Pavements|Adele|2008
I'm Yours|Jason Mraz|2008
Hey, Soul Sister|Train|2009
Breakeven|The Script|2008
Use Somebody|Kings of Leon|2008
Sex on Fire|Kings of Leon|2008
I Gotta Feeling|The Black Eyed Peas|2009
Boom Boom Pow|The Black Eyed Peas|2009
Low|Flo Rida feat. T-Pain|2007
Yeah!|Usher feat. Lil Jon & Ludacris|2004
All of Me|John Legend|2013
SexyBack|Justin Timberlake|2006
Rock Your Body|Justin Timberlake|2002
In da Club|50 Cent|2003
The Way I Are|Timbaland feat. Keri Hilson|2007
Call Me Maybe|Carly Rae Jepsen|2011
We Found Love|Rihanna feat. Calvin Harris|2011
Rolling in the Deep|Adele|2010
Someone Like You|Adele|2011
Set Fire to the Rain|Adele|2011
Grenade|Bruno Mars|2010
Just the Way You Are|Bruno Mars|2010
Locked Out of Heaven|Bruno Mars|2012
Marry You|Bruno Mars|2010
Count on Me|Bruno Mars|2010
Moves Like Jagger|Maroon 5 feat. Christina Aguilera|2011
Havana|Camila Cabello|2017
One More Night|Maroon 5|2012
Somebody That I Used to Know|Gotye feat. Kimbra|2011
We Are Young|fun. feat. Janelle Monáe|2011
Glad You Came|The Wanted|2011
What Makes You Beautiful|One Direction|2011
Story of My Life|One Direction|2013
Live While We're Young|One Direction|2012
One Thing|One Direction|2011
Perfect|One Direction|2015
Give Me Everything|Pitbull feat. Ne-Yo, Afrojack & Nayer|2011
Titanium|David Guetta feat. Sia|2011
Domino|Jessie J|2011
When I Was Your Man|Bruno Mars|2012
Rude|MAGIC!|2013
Cheerleader|OMI|2014
Shut Up and Dance|WALK THE MOON|2014
Geronimo|Sheppard|2014
Closer|The Chainsmokers feat. Halsey|2016
Paris|The Chainsmokers|2017
Something Just Like This|The Chainsmokers & Coldplay|2017
Don't Let Me Down|The Chainsmokers feat. Daya|2016
It Ain't Me|Kygo & Selena Gomez|2017
New Rules|Dua Lipa|2017
IDGAF|Dua Lipa|2017
No Tears Left to Cry|Ariana Grande|2018
thank u, next|Ariana Grande|2018
7 rings|Ariana Grande|2019
bad guy|Billie Eilish|2019
Happier|Marshmello & Bastille|2018
Eastside|benny blanco, Halsey & Khalid|2018
Youngblood|5 Seconds of Summer|2018
High Hopes|Panic! at the Disco|2018
Sucker|Jonas Brothers|2019
Only Human|Jonas Brothers|2019
Dancing with a Stranger|Sam Smith & Normani|2019
Señorita|Shawn Mendes & Camila Cabello|2019
Old Town Road|Lil Nas X|2019
Truth Hurts|Lizzo|2019
Without Me|Halsey|2018
Roses|SAINt JHN|2016
Blinding Lights|The Weeknd|2019
Save Your Tears|The Weeknd|2020
Watermelon Sugar|Harry Styles|2019
Adore You|Harry Styles|2019
Before You Go|Lewis Capaldi|2019
Dance Monkey|Tones and I|2019
Levitating|Dua Lipa|2020
Don't Start Now|Dua Lipa|2019
Physical|Dua Lipa|2020
Break My Heart|Dua Lipa|2020
Good as Hell|Lizzo|2016
drivers license|Olivia Rodrigo|2021
good 4 u|Olivia Rodrigo|2021
deja vu|Olivia Rodrigo|2021
traitor|Olivia Rodrigo|2021
STAY|The Kid LAROI & Justin Bieber|2021
Heat Waves|Glass Animals|2020
As It Was|Harry Styles|2022
Late Night Talking|Harry Styles|2022
Anti-Hero|Taylor Swift|2022
Flowers|Miley Cyrus|2023
vampire|Olivia Rodrigo|2023
Espresso|Sabrina Carpenter|2024
Please Please Please|Sabrina Carpenter|2024
Birds of a Feather|Billie Eilish|2024
TEXAS HOLD 'EM|Beyoncé|2024
Fortnight|Taylor Swift feat. Post Malone|2024
greedy|Tate McRae|2023
Paint the Town Red|Doja Cat|2023
Snooze|SZA|2022
Kill Bill|SZA|2022
Calm Down|Rema & Selena Gomez|2022
Unholy|Sam Smith & Kim Petras|2022
Lift Me Up|Rihanna|2022
About Damn Time|Lizzo|2022
Made You Look|Meghan Trainor|2022
I'm Good (Blue)|David Guetta & Bebe Rexha|2022
Shallow|Lady Gaga & Bradley Cooper|2018
Always Remember Us This Way|Lady Gaga|2018
Million Reasons|Lady Gaga|2016
The Edge of Glory|Lady Gaga|2011
Born This Way|Lady Gaga|2011
Telephone|Lady Gaga feat. Beyoncé|2009
Alejandro|Lady Gaga|2009
Raise Your Glass|P!nk|2010
Just Give Me a Reason|P!nk feat. Nate Ruess|2012
Try|P!nk|2012
What About Us|P!nk|2017
Roar|Katy Perry|2013
All Too Well|Taylor Swift|2012
Wide Awake|Katy Perry|2012
Part of Me|Katy Perry|2012
Last Friday Night|Katy Perry|2010
E.T.|Katy Perry feat. Kanye West|2010
Stronger (What Doesn't Kill You)|Kelly Clarkson|2011
My Life Would Suck Without You|Kelly Clarkson|2009
Because of You|Kelly Clarkson|2004
Who Says|Selena Gomez & the Scene|2011
Come & Get It|Selena Gomez|2013
Hands to Myself|Selena Gomez|2015
Same Old Love|Selena Gomez|2015
Love Yourself|Justin Bieber|2015
Sorry|Justin Bieber|2015
What Do You Mean?|Justin Bieber|2015
Peaches|Justin Bieber feat. Daniel Caesar & Giveon|2021
Company|Justin Bieber|2016
Closer to You|The Wallflowers|1997
On Top of the World|Imagine Dragons|2012
Demons|Imagine Dragons|2012
Radioactive|Imagine Dragons|2012
Believer|Imagine Dragons|2017
Thunder|Imagine Dragons|2017
Natural|Imagine Dragons|2018
Counting Stars|OneRepublic|2013
Secrets|OneRepublic|2009
Good Life|OneRepublic|2010
Stop and Stare|OneRepublic|2007
If I Lose Myself|OneRepublic|2013
Pompeii|Bastille|2013
Things We Lost in the Fire|Bastille|2013
Royals|Lorde|2013
Team|Lorde|2013
Green Light|Lorde|2017
Feel It Still|Portugal. The Man|2017
Safe and Sound|Capital Cities|2013
Little Talks|Of Monsters and Men|2011
Some Nights|fun.|2012
Carry On|fun.|2012
Little Lion Man|Mumford & Sons|2009
Ho Hey|The Lumineers|2012
Ophelia|The Lumineers|2016
Budapest|George Ezra|2013
Shotgun|George Ezra|2018
Home|Phillip Phillips|2012
Best Day of My Life|American Authors|2013
Attention|Charlie Puth|2017
How Long|Charlie Puth|2017
We Don't Talk Anymore|Charlie Puth feat. Selena Gomez|2016
One Call Away|Charlie Puth|2015
Marvin Gaye|Charlie Puth feat. Meghan Trainor|2015
Cool for the Summer|Demi Lovato|2015
Sorry Not Sorry|Demi Lovato|2017
Confident|Demi Lovato|2015
Heart Attack|Demi Lovato|2013
Give Your Heart a Break|Demi Lovato|2011
Want U Back|Cher Lloyd|2012
I Love It|Icona Pop feat. Charli XCX|2012
All About That Bass|Meghan Trainor|2014
Lips Are Movin|Meghan Trainor|2014
Dear Future Husband|Meghan Trainor|2014
Like I'm Gonna Lose You|Meghan Trainor feat. John Legend|2015
No Money|Galantis|2016
Runaway (U & I)|Galantis|2014
I Took a Pill in Ibiza|Mike Posner|2015
Cooler Than Me|Mike Posner|2009
Feel So Close|Calvin Harris|2011`;

module.exports = rows.trim().split('\n').map((row) => {
  const [title, artist, year] = row.split('|');
  return { title, artist, year: Number(year), genre: 'pop', classic: false };
});
