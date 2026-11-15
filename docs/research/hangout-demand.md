# Hangout demand from TikTok comments

What people say they want to do with friends, from public comments on hangout, side quest and date idea videos. This feeds the crowd prior in `convex/plans/crowd.ts`.

## Method

- Source: `ttc.jsonl` and `ttc2.jsonl`, deduped by video id. 927 unique videos, 23 hangout labels used (first date ideas, hangout ideas, side quests with friends, 24 hour challenge, spontaneous plans and so on).
- Those videos hold 4,217 comments of 20 characters or more with no mentions. A keyword filter kept the 1,446 that name an activity, a place or an action verb. The whole set passing the filter came in under the 1,500 target, so all of it was used.
- I read the top few hundred by likes, drew the archetypes from them, then assigned every filtered comment to the archetypes it mentions (a comment can count toward more than one).
- Like counts on TikTok are extremely heavy tailed. A single comment can carry 30,000 likes because it was a joke on the video. Each archetype shows its raw like total and a capped total where any one comment counts for at most 1,000 likes. The capped total is the ranking and the input to the crowd weights.
- No usernames or identifying details were kept. Examples below are paraphrases.

## Top archetypes

| # | Archetype | Capped likes | Raw likes | Comments | Paraphrased examples |
|---|---|---:|---:|---:|---|
| 1 | Classes, skills and odd certifications | 12,307 | 22,727 | 49 | Take a one-off class together, like balloon art or sign language. Get a silly certification as a pair. |
| 2 | Walk and wander with no plan | 7,660 | 12,374 | 51 | Pick a trail or street and let a coin or an app decide each turn. A long walk with snacks counts as the whole plan. |
| 3 | Mini golf, bowling, arcade, go karts | 6,458 | 14,643 | 49 | A list of mini golf, an arcade and a sporting event got wide agreement. Some say these are worn out as first dates. |
| 4 | Art and crafts | 5,988 | 8,203 | 27 | Paint or draw together. Everyone sketches the same painting at a museum and the others guess which. |
| 5 | Eat out somewhere new | 5,987 | 13,656 | 37 | A taco spot or diner as the anchor for the night. Cheap food first, then see where it goes. |
| 6 | Pranks and talking to strangers | 5,824 | 8,838 | 35 | Ask strangers for a small favor and count the yeses. Sing at a door, then run. |
| 7 | Movie night or making a film | 5,731 | 6,703 | 71 | Film a short horror movie with friends. Plenty of people also call a cinema the weakest first date. |
| 8 | Coffee, then a walk | 5,722 | 10,475 | 45 | Coffee and a walk is called unbeatable because it is cheap and easy to extend or end. |
| 9 | Hike, nature, sunrise | 4,399 | 10,060 | 35 | Hike early to catch sunrise. A creek with a picnic was one person's favorite first date. |
| 10 | Animals: aquarium, zoo, shelter walks | 4,282 | 5,051 | 38 | Borrow a shelter dog for an afternoon walk. Aquariums and zoos get named as low pressure dates. |
| 11 | Escape rooms and mystery games | 4,138 | 9,948 | 13 | Book an escape room. Reserve a library study room and solve a cold case kit on the whiteboard. |
| 12 | Cook or bake together | 3,914 | 5,080 | 22 | If a restaurant is too much, cook a meal together and eat what you made. |
| 13 | Night adventures and rooftops | 3,717 | 22,057 | 23 | Bring snacks to a high spot at night and just hang out. 24 hour stores at 2am. |
| 14 | Library and books | 3,675 | 3,675 | 26 | Read a whole book at the library in one sitting. Use free library events. |
| 15 | Sleepovers and nights in | 3,528 | 22,990 | 26 | Hide and seek in the dark at a sleepover. Fairy lights and a movie marathon. |
| 16 | Park, picnic, playground | 3,210 | 8,397 | 51 | Going to the park with friends got thousands of likes as a simple yes. Swings count. |
| 17 | Karaoke, bars and dancing | 2,885 | 24,746 | 42 | A bar with stage karaoke gives you a show and an excuse to talk. A dance class as a group. |
| 18 | Hide and seek as adults | 2,784 | 9,473 | 13 | Hide and seek with all the lights off. Adults with serious jobs playing for hours. |
| 19 | Ice and roller skating | 2,589 | 2,898 | 26 | Skating is fun exactly because nobody is good at it and you hold on to each other. |
| 20 | Concerts, games and events | 2,422 | 9,800 | 10 | Go to the local football game. Free city events listings. |
| 21 | Beach, lake, water | 2,102 | 5,411 | 28 | A lake day. A walk by the water with a dog along. |
| 22 | Car rides and drives | 2,020 | 3,320 | 12 | A long drive with music is free fun. Test drive a car for the laugh. |
| 23 | IKEA role play | 1,948 | 32,846 | 17 | Go to IKEA and act like a family picking out a house. The top single comment in the set. |
| 24 | Museum visits | 1,911 | 1,911 | 28 | A science museum on a birthday. An art museum next to a garden as one outing. |
| 25 | Take a bus or train somewhere new | 1,907 | 2,452 | 15 | Ride a bus to the end of the line and find your way back. Pick a nearby town and explore it. |
| 26 | Ice cream and dessert | 1,884 | 2,486 | 21 | Ice cream in the cold, on purpose. Ice cream as the low key date. |
| 27 | Thrift, mall and markets | 1,860 | 3,484 | 25 | Thrift each other a ridiculous outfit and wear it all night. A farmers market stroll. |
| 28 | Photo walks and shoots | 1,759 | 2,312 | 16 | A themed photo shoot night. Find one local bird and try to photograph it. |
| 29 | Geocaching and scavenger hunts | 1,143 | 1,782 | 2 | Geocaching turns a walk into a hunt and has led to meeting new people. |
| 30 | Volunteering | 1,088 | 1,088 | 9 | Volunteer as a group, plant trees, or help at a shelter. |
| 31 | Board and card games | 1,069 | 1,069 | 21 | A board game cafe with a cheap weekend rate. Play a new game without reading the rules. |

Reading the table:
- The strongest signal is low cost, low commitment activities with a built in thing to do: walks, coffee, parks, skill classes and arcade style games.
- Arcade games, escape rooms and hide and seek carry the "silly, playful" energy people ask for. Frolic's catalog has only two game spots.
- IKEA, bars and night adventures rank high on raw likes because of one or two viral comments each. The capped totals put them mid table.

## Blockers people complain about

Counts are comments mentioning the blocker in the filtered set. The keyword match is loose, so treat the order as a rough guide.

| Blocker | Comments | What people say |
|---|---:|---|
| Money | 67 | Being broke is the most common complaint. Gas prices make even a free drive cost something. Zoo tickets feel too expensive. |
| No friends to go with | 15 | The list is great, but they do not have friends like that. Step one is making friends. |
| Anxiety, going alone | 32 | They will not leave the house without someone else. Going out alone feels like a confidence level they lack. |
| Safety | 18 | Gas stations at night feel scary. Women say going out alone takes more care. A public trail feels safe for a first meeting. |
| Age: under 21 or a minor | 14 | Bar advice only works at 21. Younger teens say they cannot go anywhere without a ride. Parks with curfews. |
| No car, transit | 29 | Long drives need a car and gas money. Bus ideas depend on where you live. |
| Small town, nothing nearby | 8 | Nothing to do in a small town. Ideas assume a city. |
| Weather and season | 24 | Winter kills the free outdoor options and indoor ones cost money. |
| Friends flake or stay on phones | 5 | Plans get made and nobody goes. Friends sit on their phones. |

What this means for Frolic:
- Free and walkable plans in Berkeley answer the top three blockers directly. The catalog already leans that way.
- Frolic's matching answers the flaking complaint: a plan only goes out when two or more people tap in.
- Rainy and cold days need cheap indoor picks. Games and book spots already fill that role.

## How this feeds scoring

`convex/plans/crowd.ts` holds the capped like totals for each archetype and the catalog tags each one maps to. Each archetype's likes are split across its tags, summed per tag and scaled so the top tag is 1. A place's weight is the weight of its primary tag, with a few hand set slug overrides for places that match an archetype better than their tag does (the two game spots, Lawrence Hall, Tilden Little Farm).

The engine adds `crowdWeight * 8` for crews with no taste history and `crowdWeight * 8 / 3` otherwise. For scale, golden hour is worth 15 and a place used in the last three days loses 80, so the prior only decides close calls.

## Gaps in the catalog

High demand archetypes with no catalog place yet: bowling and arcades, escape rooms, skating, karaoke and museum style science or art outings beyond Lawrence Hall and BAMPFA. They are good candidates for new places once each is verified for address, hours and price.
