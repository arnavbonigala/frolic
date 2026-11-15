export type MemoryContext = {
  likedTags: string[];
  skipped: { tag: string; count: number }[];
  suppressed: string[];
  pastNights: { id: string; text: string; placeId?: string; date?: string }[];
};

export type MemoryRequest = { groupId: string; day: string };
export type MemoryProvider = (req: MemoryRequest) => Promise<MemoryContext>;

export const EMPTY_MEMORY: MemoryContext = { likedTags: [], skipped: [], suppressed: [], pastNights: [] };

export const emptyMemoryProvider: MemoryProvider = async () => EMPTY_MEMORY;
