import type { EditorGroup, EditorSplit } from "../../types";

export interface EditorUIState {
  activeGroupId: string;
  groups: EditorGroup[];
  splits: EditorSplit[];
  maximizedGroupId: string | null;
}
