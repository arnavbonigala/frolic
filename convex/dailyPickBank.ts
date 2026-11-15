export type PickOption = { label: string; tags: string[] };
export type PickQuestion = { key: string; category: string; text: string; options: PickOption[] };

const o = (label: string, ...tags: string[]): PickOption => ({ label, tags });
const q = (key: string, category: string, text: string, ...options: PickOption[]): PickQuestion => ({ key, category, text, options });

export const QUESTION_BANK: PickQuestion[] = [
  q("noodles-tacos", "food", "Tonight: noodles or tacos?", o("Noodles", "late_night_food", "food"), o("Tacos", "food")),
  q("pizza-dumplings", "food", "Pizza or dumplings?", o("Pizza", "food"), o("Dumplings", "food", "late_night_food")),
  q("boba-coffee", "food", "Boba or coffee?", o("Boba", "boba"), o("Coffee", "coffee")),
  q("icecream-donuts", "food", "Ice cream or donuts?", o("Ice cream", "dessert"), o("Donuts", "dessert")),
  q("breakfast-dinner", "food", "Breakfast for dinner or dinner for breakfast?", o("Breakfast for dinner", "food"), o("Dinner for breakfast", "food")),
  q("midnight-snack", "food", "Midnight snack: fries, ramen or a burrito?", o("Fries", "late_night_food"), o("Ramen", "late_night_food", "food"), o("A burrito", "late_night_food", "food")),
  q("market-dinner", "food", "Market stroll or sit-down dinner?", o("Market stroll", "market"), o("Sit-down dinner", "food")),

  q("inside-outside", "outside", "Inside or outside today?", o("Inside"), o("Outside", "outdoors")),
  q("beach-hills", "outside", "Beach or hills?", o("Beach", "water", "outdoors"), o("Hills", "hiking", "views")),
  q("picnic-patio", "outside", "Picnic or patio?", o("Picnic", "picnic", "outdoors"), o("Patio", "food")),
  q("view-snacks", "outside", "A walk with a view or a walk with snacks?", o("A view", "views", "outdoors"), o("Snacks", "food")),
  q("lake-ocean", "outside", "Lake, ocean or neither?", o("Lake", "water", "nature"), o("Ocean", "water"), o("Neither")),
  q("hike-stroll", "outside", "Big hike or tiny stroll?", o("Big hike", "hiking", "outdoors"), o("Tiny stroll", "outdoors")),

  q("sunset-stars", "sky", "Sunset or stars?", o("Sunset", "sunsets"), o("Stars", "views", "nature")),
  q("golden-blue", "sky", "Golden hour or blue hour?", o("Golden hour", "sunsets"), o("Blue hour", "views")),
  q("sunrise-sunset", "sky", "Sunrise club or sunset club?", o("Sunrise club", "views"), o("Sunset club", "sunsets")),
  q("high-water", "sky", "Up high or down by the water?", o("Up high", "views"), o("By the water", "water")),
  q("cloudy-plan", "sky", "Cloudy day plan: cafe or museum?", o("Cafe", "coffee"), o("Museum", "art", "science")),
  q("rain-plan", "sky", "Rainy day: board games or a movie?", o("Board games", "games"), o("A movie")),

  q("chill-new", "vibe", "Something chill or something new?", o("Something chill"), o("Something new", "play")),
  q("cozy-chaotic", "vibe", "Cozy or chaotic?", o("Cozy", "coffee", "books"), o("Chaotic", "play", "games")),
  q("talk-do", "vibe", "Talk for hours or do something?", o("Talk for hours", "coffee"), o("Do something", "play")),
  q("plan-wing", "vibe", "Plan every detail or wing it?", o("Plan it"), o("Wing it")),
  q("early-late", "vibe", "Early night or late night?", o("Early night"), o("Late night", "late_night_food")),
  q("main-character", "vibe", "Main character walk or cozy corner booth?", o("Main character walk", "outdoors"), o("Cozy corner booth", "food")),

  q("free-paying", "money", "Free or worth paying for?", o("Free", "free"), o("Worth paying for")),
  q("splurge-cheap", "money", "Splurge a little or keep it cheap?", o("Splurge"), o("Keep it cheap", "free")),
  q("five-bucks", "money", "Five bucks: boba, a used book or a scoop?", o("Boba", "boba"), o("A used book", "books"), o("A scoop", "dessert")),
  q("concert-show", "money", "Free concert or cheap show?", o("Free concert", "music", "free"), o("Cheap show", "music")),
  q("campus-city", "money", "Campus hang or a trip to the city?", o("Campus hang", "campus", "free"), o("Trip to the city", "city_trip")),
  q("thrift-window", "money", "Thrift run or window shopping?", o("Thrift run", "market"), o("Window shopping", "free")),

  q("bowling-minigolf", "play", "Bowling or mini golf?", o("Bowling", "games"), o("Mini golf", "games", "play")),
  q("arcade-board", "play", "Arcade or board games?", o("Arcade", "games", "play"), o("Board games", "games")),
  q("karaoke-trivia", "play", "Karaoke or trivia?", o("Karaoke", "music", "play"), o("Trivia", "games")),
  q("game-snacks", "play", "Winning the game or winning the snacks?", o("The game", "games"), o("The snacks", "food")),
  q("frisbee-cards", "play", "Frisbee in the park or cards at a table?", o("Frisbee", "outdoors", "play"), o("Cards", "games")),
  q("rematch-new", "play", "Rematch or a brand new game?", o("Rematch", "games"), o("New game", "games", "play")),

  q("books-records", "culture", "Bookstore or record store?", o("Bookstore", "books"), o("Record store", "music")),
  q("museum-murals", "culture", "Museum or a mural walk?", o("Museum", "art", "science"), o("Mural walk", "art", "outdoors")),
  q("live-playlist", "culture", "Live music or a good playlist and snacks?", o("Live music", "music"), o("Playlist and snacks", "food")),
  q("science-art", "culture", "Science museum or art museum?", o("Science", "science"), o("Art", "art")),
  q("poetry-comedy", "culture", "Poetry night or comedy night?", o("Poetry", "books", "art"), o("Comedy", "play")),
  q("library-cafe", "culture", "Library hideout or cafe hangout?", o("Library", "books", "campus"), o("Cafe", "coffee")),

  q("dogs-ducks", "wild", "Dogs or ducks?", o("Dogs", "animals"), o("Ducks", "animals", "water")),
  q("farmers-flea", "wild", "Farmers market or flea market?", o("Farmers market", "market", "food"), o("Flea market", "market")),
  q("cats-dogs", "wild", "Cats or dogs, for the record?", o("Cats", "animals"), o("Dogs", "animals")),
  q("superpower", "wild", "Superpower for tonight: teleporting or never getting tired?", o("Teleporting", "city_trip"), o("Never tired", "late_night_food")),
  q("cocoa-iced", "wild", "Hot chocolate or iced coffee?", o("Hot chocolate", "dessert"), o("Iced coffee", "coffee")),
  q("garden-taco", "wild", "Find a hidden garden or a secret taco spot?", o("Hidden garden", "nature", "outdoors"), o("Secret taco spot", "food")),
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

const MIN_BANK = NO_REPEAT_DAYS + 1;

export type PickHistory = { day: string; key: string; category: string };

export function chooseQuestion(groupId: string, day: string, history: PickHistory[], passed: string[] = []): PickQuestion {
  const recent = history.filter((h) => h.day < day && dayNumber(day) - dayNumber(h.day) < NO_REPEAT_DAYS);
  const used = new Set(recent.map((h) => h.key));
  const lastCategory = new Map<string, string>();
  for (const h of recent) if ((lastCategory.get(h.category) ?? "") < h.day) lastCategory.set(h.category, h.day);
  const passedTags = new Set(passed);
  const openBank = QUESTION_BANK.filter((question) => !question.options.some((option) => option.tags.some((tag) => passedTags.has(tag))));
  const bank = openBank.length >= MIN_BANK ? openBank : QUESTION_BANK;
  const fresh = bank.filter((question) => !used.has(question.key));
  const pool = fresh.length > 0 ? fresh : bank;
  const seed = groupId + "|" + day;
  const categories = [...new Set(pool.map((question) => question.category))].sort(
    (a, b) => (lastCategory.get(a) ?? "").localeCompare(lastCategory.get(b) ?? "") || hash(seed + "|" + a) - hash(seed + "|" + b),
  );
  const candidates = pool.filter((question) => question.category === categories[0]);
  return candidates.sort((a, b) => hash(seed + "|" + a.key) - hash(seed + "|" + b.key))[0];
}

export function smsLine(text: string): string {
  const colon = text.indexOf(": ");
  const rest = colon >= 0 ? text.slice(colon + 2) : text;
  return "Quick one: " + rest.charAt(0).toLowerCase() + rest.slice(1);
}
