export default {
  title: "Design system/Foundations/Spacing",
  parameters: {
    docs: {
      description: {
        component: "8px rhythm from theme tokens (`--space-*`). Bars use `--color-primary` for visibility.",
      },
    },
  },
};

function row(barClass, label, token) {
  return `<div class="sb-fd-space-row">
    <div class="sb-fd-space-bar ${barClass}" aria-hidden="true"></div>
    <span class="muted">${label}</span>
    <code class="sb-fd-space-token">${token}</code>
  </div>`;
}

export const Scale = () =>
  `<div>
    ${row("sb-fd-space-bar--half", "half · 4px", "--space-half")}
    ${row("sb-fd-space-bar--1", "1 · 8px", "--space-1")}
    ${row("sb-fd-space-bar--2", "2 · 16px", "--space-2")}
    ${row("sb-fd-space-bar--3", "3 · 24px", "--space-3")}
    ${row("sb-fd-space-bar--4", "4 · 32px", "--space-4")}
    ${row("sb-fd-space-bar--touch", "touch · 48px", "--space-touch")}
  </div>`;

Scale.storyName = "Spacing scale";
