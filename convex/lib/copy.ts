export const FADED_TITLE = "This one drifted off";
export const FADED_BODY = "Nobody knows you said yes.";
export const FADED_TEXT = FADED_TITLE + ". " + FADED_BODY;
export const BAIL_BODY = "Your crew will see a spot open up.";
export const ONLY_IF_BUTTON = "Only with…";
export const ONLY_IF_TITLE = "I'm down only with…";
export const PROMISE = "Be the friend who says yes.";
export const CREW_LINE_MAX = 150;
const CREW_LINE_FLOOR = 60;

function fitLine(line: string, room: number): string {
  if (line.length <= room) return line;
  const cut = line.slice(0, room);
  const stop = cut.lastIndexOf(". ");
  if (stop > 0) return cut.slice(0, stop + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[.,;:]+$/, "") + "…";
}

export function crewFirst(crewName: string, text: string): string {
  const crew = crewName.trim();
  if (!crew || text.toLowerCase().includes(crew.toLowerCase())) return text;
  const [first, ...rest] = text.split("\n");
  const room = Math.max(CREW_LINE_FLOOR, CREW_LINE_MAX - crew.length - 2);
  return [crew + ": " + fitLine(first, room), ...rest].join("\n");
}
