import { CUSTOM_ANIMATIONS } from "./customization";

// Only character-led dance loops belong in this picker, not hearts, birthday
// greetings or ambient backgrounds from the larger customization catalogue.
export const DANCING_CHARACTERS = [
  { id: "dog", label: "Dancing dog", animationId: "moments-2" },
  { id: "skeleton", label: "Skeleton groove", animationId: "moments-4" },
  { id: "dj", label: "DJ groove", animationId: "moments-3" },
] as const;
export type DancingCharacter = (typeof DANCING_CHARACTERS)[number];
export function dancingCharacterSource(character: DancingCharacter): string {
  return CUSTOM_ANIMATIONS.find((asset) => asset.id === character.animationId)!
    .src;
}
