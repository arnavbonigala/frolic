export type PickOption = { label: string; tags: string[] };
export type PickQuestion = { key: string; category: string; text: string; options: PickOption[] };

const o = (label: string, ...tags: string[]): PickOption => ({ label, tags });
const q = (key: string, category: string, text: string, ...options: PickOption[]): PickQuestion => ({ key, category, text, options });

export const QUESTION_BANK: PickQuestion[] = [
  q("noodles-tacos", "food", "Tonight: noodles or tacos?", o("noodles", "late_night_food", "food"), o("tacos", "food")),
  q("pizza-dumplings", "food", "Pizza or dumplings?", o("pizza", "food"), o("dumplings", "food", "late_night_food")),
  q("boba-coffee", "food", "Boba or coffee?", o("boba", "boba"), o("coffee", "coffee")),
  q("icecream-donuts", "food", "Ice cream or donuts?", o("ice cream", "dessert"), o("donuts", "dessert")),
  q("breakfast-dinner", "food", "Breakfast for dinner or dinner for breakfast?", o("breakfast for dinner", "food"), o("dinner for breakfast", "food")),
  q("midnight-snack", "food", "Midnight snack: fries, ramen or a burrito?", o("fries", "late_night_food"), o("ramen", "late_night_food", "food"), o("a burrito", "late_night_food", "food")),
  q("market-dinner", "food", "Market stroll or sit-down dinner?", o("market stroll", "market"), o("sit-down dinner", "food")),

  q("inside-outside", "outside", "Inside or outside today?", o("inside"), o("outside", "outdoors")),
  q("beach-hills", "outside", "Beach or hills?", o("beach", "water", "outdoors"), o("hills", "hiking", "views")),
  q("picnic-patio", "outside", "Picnic or patio?", o("picnic", "picnic", "outdoors"), o("patio", "food")),
  q("view-snacks", "outside", "A walk with a view or a walk with snacks?", o("a view", "views", "outdoors"), o("snacks", "food")),
  q("lake-ocean", "outside", "Lake, ocean or neither?", o("lake", "water", "nature"), o("ocean", "water"), o("neither")),
  q("hike-stroll", "outside", "Big hike or tiny stroll?", o("big hike", "hiking", "outdoors"), o("tiny stroll", "outdoors")),

  q("sunset-stars", "sky", "Sunset or stars?", o("sunset", "sunsets"), o("stars", "views", "nature")),
  q("golden-blue", "sky", "Golden hour or blue hour?", o("golden hour", "sunsets"), o("blue hour", "views")),
  q("sunrise-sunset", "sky", "Sunrise club or sunset club?", o("sunrise club", "views"), o("sunset club", "sunsets")),
  q("high-water", "sky", "Up high or down by the water?", o("up high", "views"), o("by the water", "water")),
  q("cloudy-plan", "sky", "Cloudy day plan: cafe or museum?", o("cafe", "coffee"), o("museum", "art", "science")),
  q("rain-plan", "sky", "Rainy day: board games or a movie?", o("board games", "games"), o("a movie")),

  q("chill-new", "vibe", "Something chill or something new?", o("something chill"), o("something new", "play")),
  q("cozy-chaotic", "vibe", "Cozy or chaotic?", o("cozy", "coffee", "books"), o("chaotic", "play", "games")),
  q("talk-do", "vibe", "Talk for hours or do something?", o("talk for hours", "coffee"), o("do something", "play")),
  q("plan-wing", "vibe", "Plan every detail or wing it?", o("plan it"), o("wing it")),
  q("early-late", "vibe", "Early night or late night?", o("early night"), o("late night", "late_night_food")),
  q("main-character", "vibe", "Main character walk or cozy corner booth?", o("main character walk", "outdoors"), o("cozy corner booth", "food")),

  q("free-paying", "money", "Free or worth paying for?", o("free", "free"), o("worth paying for")),
  q("splurge-cheap", "money", "Splurge a little or keep it cheap?", o("splurge"), o("keep it cheap", "free")),
  q("five-bucks", "money", "Five bucks: boba, a used book or a scoop?", o("boba", "boba"), o("a used book", "books"), o("a scoop", "dessert")),
  q("concert-show", "money", "Free concert or cheap show?", o("free concert", "music", "free"), o("cheap show", "music")),
  q("campus-city", "money", "Campus hang or a trip to the city?", o("campus hang", "campus", "free"), o("trip to the city", "city_trip")),
  q("thrift-window", "money", "Thrift run or window shopping?", o("thrift run", "market"), o("window shopping", "free")),

  q("bowling-minigolf", "play", "Bowling or mini golf?", o("bowling", "games"), o("mini golf", "games", "play")),
  q("arcade-board", "play", "Arcade or board games?", o("arcade", "games", "play"), o("board games", "games")),
  q("karaoke-trivia", "play", "Karaoke or trivia?", o("karaoke", "music", "play"), o("trivia", "games")),
  q("game-snacks", "play", "Winning the game or winning the snacks?", o("the game", "games"), o("the snacks", "food")),
  q("frisbee-cards", "play", "Frisbee in the park or cards at a table?", o("frisbee", "outdoors", "play"), o("cards", "games")),
  q("rematch-new", "play", "Rematch or a brand new game?", o("rematch", "games"), o("new game", "games", "play")),

  q("books-records", "culture", "Bookstore or record store?", o("bookstore", "books"), o("record store", "music")),
  q("museum-murals", "culture", "Museum or a mural walk?", o("museum", "art", "science"), o("mural walk", "art", "outdoors")),
  q("live-playlist", "culture", "Live music or a good playlist and snacks?", o("live music", "music"), o("playlist and snacks", "food")),
  q("science-art", "culture", "Science museum or art museum?", o("science", "science"), o("art", "art")),
  q("poetry-comedy", "culture", "Poetry night or comedy night?", o("poetry", "books", "art"), o("comedy", "play")),
  q("library-cafe", "culture", "Library hideout or cafe hangout?", o("library", "books", "campus"), o("cafe", "coffee")),

  q("dogs-ducks", "wild", "Dogs or ducks?", o("dogs", "animals"), o("ducks", "animals", "water")),
  q("farmers-flea", "wild", "Farmers market or flea market?", o("farmers market", "market", "food"), o("flea market", "market")),
  q("cats-dogs", "wild", "Cats or dogs, for the record?", o("cats", "animals"), o("dogs", "animals")),
  q("superpower", "wild", "Superpower for tonight: teleporting or never getting tired?", o("teleporting", "city_trip"), o("never tired", "late_night_food")),
  q("cocoa-iced", "wild", "Hot chocolate or iced coffee?", o("hot chocolate", "dessert"), o("iced coffee", "coffee")),
  q("garden-taco", "wild", "Find a hidden garden or a secret taco spot?", o("hidden garden", "nature", "outdoors"), o("secret taco spot", "food")),
];

export const BANK_BY_KEY = new Map(QUESTION_BANK.map((question) => [question.key, question]));

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const dayNumber = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000;

export const NO_REPEAT_DAYS = 30;

export function chooseQuestion(groupId: string, day: string, history: { day: string; key: string; category: string }[]): PickQuestion {
  const recent = history.filter((h) => h.day < day && dayNumber(day) - dayNumber(h.day) < NO_REPEAT_DAYS);
  const used = new Set(recent.map((h) => h.key));
  const fresh = QUESTION_BANK.filter((question) => !used.has(question.key));
  const pool = fresh.length > 0 ? fresh : QUESTION_BANK;
  const lastUsed = new Map<string, string>();
  for (const h of recent) if ((lastUsed.get(h.category) ?? "") < h.day) lastUsed.set(h.category, h.day);
  const seed = groupId + "|" + day;
  const categories = [...new Set(pool.map((question) => question.category))].sort(
    (a, b) => (lastUsed.get(a) ?? "").localeCompare(lastUsed.get(b) ?? "") || hash(seed + "|" + a) - hash(seed + "|" + b),
  );
  const candidates = pool.filter((question) => question.category === categories[0]);
  return candidates.sort((a, b) => hash(seed + "|" + a.key) - hash(seed + "|" + b.key))[0];
}

export function smsLine(text: string): string {
  const colon = text.indexOf(": ");
  const rest = colon >= 0 ? text.slice(colon + 2) : text;
  return "Quick one: " + rest.charAt(0).toLowerCase() + rest.slice(1);
}
