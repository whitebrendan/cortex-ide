import { Component, JSX, createSignal, onCleanup, onMount } from "solid-js";

type AnnouncementPoliteness = "polite" | "assertive";

export interface ScreenReaderAnnouncerProps {
  class?: string;
  style?: JSX.CSSProperties;
}

const VISUALLY_HIDDEN_STYLE: JSX.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  "white-space": "nowrap",
  border: "0",
};

export const ScreenReaderAnnouncer: Component<ScreenReaderAnnouncerProps> = (props) => {
  const [politeMessage, setPoliteMessage] = createSignal("");
  const [assertiveMessage, setAssertiveMessage] = createSignal("");
  const pendingFrames: Partial<Record<AnnouncementPoliteness, number>> = {};

  const clearPendingFrame = (politeness: AnnouncementPoliteness) => {
    const frameId = pendingFrames[politeness];
    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
      delete pendingFrames[politeness];
    }
  };

  const scheduleAnnouncement = (
    politeness: AnnouncementPoliteness,
    message: string
  ) => {
    clearPendingFrame(politeness);

    if (politeness === "assertive") {
      setAssertiveMessage("");
      pendingFrames.assertive = requestAnimationFrame(() => {
        setAssertiveMessage(message);
        delete pendingFrames.assertive;
      });
      return;
    }

    setPoliteMessage("");
    pendingFrames.polite = requestAnimationFrame(() => {
      setPoliteMessage(message);
      delete pendingFrames.polite;
    });
  };

  onMount(() => {
    const handleAnnouncement = (
      event: CustomEvent<{ message: string; politeness?: AnnouncementPoliteness }>
    ) => {
      if (!event.detail?.message) return;
      scheduleAnnouncement(event.detail.politeness ?? "polite", event.detail.message);
    };

    window.addEventListener(
      "accessibility:announcement",
      handleAnnouncement as EventListener
    );

    onCleanup(() => {
      clearPendingFrame("polite");
      clearPendingFrame("assertive");
      window.removeEventListener(
        "accessibility:announcement",
        handleAnnouncement as EventListener
      );
    });
  });

  return (
    <div class={props.class} style={{ ...VISUALLY_HIDDEN_STYLE, ...props.style }}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {politeMessage()}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {assertiveMessage()}
      </div>
    </div>
  );
};

export default ScreenReaderAnnouncer;
