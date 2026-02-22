import { createSignal, createEffect, onMount, onCleanup, Show, For } from "solid-js";
import { Icon } from "../ui/Icon";
import { FOLDER_COLORS } from "@/context/WorkspaceContext";
import { tokens } from "@/design-system/tokens";
import type { WorkspaceFolderHeaderProps } from "./types";

export function WorkspaceFolderHeader(props: WorkspaceFolderHeaderProps) {
  const [showMenu, setShowMenu] = createSignal(false);
  const [showColorPicker, setShowColorPicker] = createSignal(false);
  const [isRenaming, setIsRenaming] = createSignal(false);
  const [renameValue, setRenameValue] = createSignal(props.folder.name);
  let menuRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;

  const handleRenameSubmit = () => {
    const newName = renameValue().trim();
    if (newName && newName !== props.folder.name) {
      props.onRename(newName);
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setRenameValue(props.folder.name);
      setIsRenaming(false);
    }
  };

  createEffect(() => {
    if (isRenaming()) {
      setRenameValue(props.folder.name);
      setTimeout(() => inputRef?.select(), 10);
    }
  });

  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        setShowMenu(false);
        setShowColorPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));
  });

  return (
    <div
      class="workspace-folder-header"
      classList={{
        "workspace-folder-header--active": props.isActive,
        "workspace-folder-header--expanded": props.isExpanded,
      }}
      style={{
        "border-left": props.folder.color ? `3px solid ${props.folder.color}` : undefined,
      }}
      draggable={props.totalFolders > 1}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onDragEnd={props.onDragEnd}
    >
      <button
        class="workspace-folder-toggle"
        onClick={props.onToggle}
        title={props.isExpanded ? "Collapse" : "Expand"}
      >
        {props.isExpanded ? (
          <Icon name="chevron-down" size={14} />
        ) : (
          <Icon name="chevron-right" size={14} />
        )}
      </button>

      <div class="workspace-folder-info" onClick={props.onSetActive}>
        <Show
          when={!isRenaming()}
          fallback={
            <input
              ref={inputRef}
              type="text"
              class="workspace-folder-rename-input"
              value={renameValue()}
              onInput={(e) => setRenameValue(e.currentTarget.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameSubmit}
            />
          }
        >
          <span class="workspace-folder-name" title={props.folder.path}>
            {props.folder.name}
          </span>
        </Show>
      </div>

      <div class="workspace-folder-actions">
        <div class="relative" ref={menuRef}>
          <button
            class="workspace-folder-action"
            onClick={() => setShowMenu(!showMenu())}
            title="More actions"
          >
            <Icon name="ellipsis-vertical" size={14} />
          </button>

          <Show when={showMenu()}>
            <div class="workspace-folder-menu">
              <button
                class="workspace-folder-menu-item"
                onClick={() => {
                  setIsRenaming(true);
                  setShowMenu(false);
                }}
              >
                Rename
              </button>
              <button
                class="workspace-folder-menu-item"
                onClick={() => {
                  setShowColorPicker(!showColorPicker());
                }}
              >
                Set Color
              </button>
              <Show when={showColorPicker()}>
                <div class="workspace-folder-color-picker">
                  <For each={FOLDER_COLORS}>
                    {(colorOption) => (
                      <button
                        class="workspace-folder-color-swatch"
                        classList={{
                          "workspace-folder-color-swatch--selected": 
                            colorOption.value === props.folder.color,
                        }}
                        style={{
                          "background-color": colorOption.value || tokens.colors.interactive.hover,
                        }}
                        title={colorOption.name}
                        onClick={() => {
                          props.onSetColor(colorOption.value);
                          setShowColorPicker(false);
                          setShowMenu(false);
                        }}
                      />
                    )}
                  </For>
                </div>
              </Show>
              <div class="workspace-folder-menu-divider" />
              <button
                class="workspace-folder-menu-item workspace-folder-menu-item--danger"
                onClick={() => {
                  props.onRemove();
                  setShowMenu(false);
                }}
              >
                Remove from Project
              </button>
            </div>
          </Show>
        </div>

        <button
          class="workspace-folder-action workspace-folder-action--remove"
          onClick={props.onRemove}
          title="Remove from project"
        >
          <Icon name="xmark" size={14} />
        </button>
      </div>
    </div>
  );
}
