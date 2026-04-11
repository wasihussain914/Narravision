export interface Character {
  name: string;
  visual_description: string;
  first_appears_at: number;
}

export interface Location {
  name: string;
  visual_description: string;
  first_appears_at: number;
}

export interface ArtDirection {
  style: string;
  palette: string;
  mood: string;
}

export interface Scene {
  id: number;
  start_char: number;
  end_char: number;
  summary: string;
  present_characters: string[];
  present_locations: string[];
}

export interface StoryBible {
  title: string;
  art_direction: ArtDirection;
  characters: Character[];
  locations: Location[];
  scenes: Scene[];
  book_length: number;
}
