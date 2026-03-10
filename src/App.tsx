import { ParentProps } from "solid-js";

type AppProps = ParentProps<{
  class?: string;
  testId?: string;
}>;

export default function App(props: AppProps) {
  const className = [
    "flex h-screen w-screen flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]",
    props.class,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="application"
      data-testid={props.testId ?? "app-root"}
      class={className}
    >
      {props.children}
    </div>
  );
}
