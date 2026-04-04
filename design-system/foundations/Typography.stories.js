export default {
  title: "Design system/Foundations/Typography",
  parameters: {
    docs: {
      description: {
        component: "Type scale from theme tokens (`--typo-*`, `--font-family-body`).",
      },
    },
  },
};

export const Scale = () => `<div>
  <p class="sb-fd-type-sample sb-fd-type-display">Display small — hero headlines</p>
  <p class="sb-fd-type-sample sb-fd-type-headline">Headline medium — section titles</p>
  <p class="sb-fd-type-sample sb-fd-type-body">Body large — default reading text on public pages.</p>
</div>`;

Scale.storyName = "Type scale";
