import { Component, createSignal, Show } from "solid-js";

export interface WelcomeLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoogleLogin?: () => void;
  onGitHubLogin?: () => void;
}

export const WelcomeLoginModal: Component<WelcomeLoginModalProps> = (props) => {
  return (
    <Show when={props.isOpen}>
      <div
        style={{
          position: "fixed",
          inset: "0",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          "z-index": "var(--cortex-z-modal, 500)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "0",
            background: "rgba(0, 0, 0, 0.5)",
          }}
          onClick={props.onClose}
        />

        <div
          style={{
            position: "relative",
            width: "313px",
            padding: "12px",
            background: "#141415",
            border: "1px solid #2E2F31",
            "border-radius": "16px",
            "font-family": "'Figtree', var(--cortex-font-sans)",
            "z-index": "1",
          }}
        >
          <button
            onClick={props.onClose}
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              width: "24px",
              height: "24px",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: "#1C1C1D",
              border: "none",
              "border-radius": "6px",
              cursor: "pointer",
              padding: "0",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M1 1L10 10M10 1L1 10"
                stroke="#8C8C8F"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>

          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
              }}
            >
              <div
                style={{
                  width: "100px",
                  height: "100px",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  "border-radius": "12px",
                }}
              >
                <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                  <g>
                    <path d="M18 14L6 24L18 14Z" fill="#4C4C4D" />
                    <path d="M18 14L18 46L6 24L18 14Z" fill="#4C4C4D" />
                    <path d="M24 8L18 14L24 28L24 8Z" fill="#4C4C4D" />
                    <path d="M42 14L54 24L42 14Z" fill="#4C4C4D" />
                    <path d="M42 14L42 46L54 24L42 14Z" fill="#4C4C4D" />
                    <path d="M36 8L42 14L36 28L36 8Z" fill="#4C4C4D" />
                  </g>
                </svg>
              </div>
              <span
                style={{
                  "font-size": "16px",
                  "font-weight": "500",
                  color: "#FCFCFC",
                  "text-align": "center",
                  "line-height": "16px",
                }}
              >
                Sign In
              </span>
            </div>

            <p
              style={{
                "font-size": "12px",
                "font-weight": "400",
                color: "#8C8C8F",
                margin: "0",
                "line-height": "15px",
              }}
            >
              In order to use AI functions you need to connect your Google or
              GitHub account
            </p>

            <div
              style={{
                display: "flex",
                "flex-direction": "column",
                gap: "8px",
              }}
            >
              <LoginButton
                label="Continue with Google"
                icon="google"
                onClick={props.onGoogleLogin}
              />
              <LoginButton
                label="Continue with GitHub"
                icon="github"
                onClick={props.onGitHubLogin}
              />
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};

interface LoginButtonProps {
  label: string;
  icon: "google" | "github";
  onClick?: () => void;
}

function LoginButton(props: LoginButtonProps) {
  const [hovered, setHovered] = createSignal(false);

  return (
    <button
      onClick={props.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        gap: "4px",
        width: "100%",
        height: "32px",
        padding: "8px",
        background: hovered() ? "#3A3A3D" : "#2E2E31",
        border: "none",
        "border-radius": "8px",
        cursor: "pointer",
        "font-family": "'Figtree', var(--cortex-font-sans)",
        transition: "background var(--cortex-transition-fast, 100ms ease)",
      }}
    >
      <Show when={props.icon === "google"}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M14.537 6.594H14V6.563H8V9.438H11.769C11.188 11.019 9.719 12.125 8 12.125C5.72 12.125 3.875 10.28 3.875 8C3.875 5.72 5.72 3.875 8 3.875C9.05 3.875 10.006 4.281 10.731 4.944L12.769 2.906C11.506 1.731 9.838 1 8 1C4.134 1 1 4.134 1 8C1 11.866 4.134 15 8 15C11.866 15 15 11.866 15 8C15 7.519 14.794 7.044 14.537 6.594Z"
            fill="#FFC107"
          />
          <path
            d="M1.884 4.881L4.247 6.625C4.878 5.119 6.316 3.875 8 3.875C9.05 3.875 10.006 4.281 10.731 4.944L12.769 2.906C11.506 1.731 9.838 1 8 1C5.297 1 2.947 2.581 1.884 4.881Z"
            fill="#FF3D00"
          />
          <path
            d="M8 15C9.8 15 11.434 14.3 12.688 13.163L10.456 11.281C9.756 11.806 8.9 12.125 8 12.125C6.288 12.125 4.822 11.025 4.238 9.453L1.847 11.269C2.897 13.481 5.266 15 8 15Z"
            fill="#4CAF50"
          />
          <path
            d="M14.537 6.594H14V6.563H8V9.438H11.769C11.491 10.194 10.997 10.844 10.456 11.281L12.688 13.163C12.522 13.313 15 11.5 15 8C15 7.519 14.794 7.044 14.537 6.594Z"
            fill="#1976D2"
          />
        </svg>
      </Show>
      <Show when={props.icon === "github"}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 0.5C3.58 0.5 0 4.08 0 8.5C0 12.08 2.29 15.09 5.47 16.13C5.87 16.2 6.02 15.96 6.02 15.75C6.02 15.56 6.01 14.94 6.01 14.28C4 14.66 3.48 13.9 3.32 13.5C3.23 13.29 2.84 12.58 2.5 12.39C2.22 12.24 1.82 11.86 2.49 11.85C3.12 11.84 3.57 12.43 3.72 12.67C4.44 13.87 5.57 13.56 6.05 13.35C6.12 12.84 6.33 12.49 6.56 12.29C4.78 12.09 2.92 11.41 2.92 8.33C2.92 7.47 3.23 6.76 3.74 6.21C3.66 6.01 3.38 5.2 3.82 4.11C3.82 4.11 4.49 3.9 6.02 4.93C6.66 4.75 7.34 4.66 8.02 4.66C8.7 4.66 9.38 4.75 10.02 4.93C11.55 3.89 12.22 4.11 12.22 4.11C12.66 5.2 12.38 6.01 12.3 6.21C12.81 6.76 13.12 7.46 13.12 8.33C13.12 11.42 11.25 12.09 9.47 12.29C9.76 12.54 10.01 13.02 10.01 13.76C10.01 14.82 10 15.68 10 15.75C10 15.96 10.15 16.21 10.55 16.13C13.71 15.09 16 12.07 16 8.5C16 4.08 12.42 0.5 8 0.5Z"
            fill="#FCFCFC"
          />
        </svg>
      </Show>
      <span
        style={{
          "font-size": "14px",
          "font-weight": "500",
          color: "#FCFCFC",
          "line-height": "16px",
        }}
      >
        {props.label}
      </span>
    </button>
  );
}

export default WelcomeLoginModal;
