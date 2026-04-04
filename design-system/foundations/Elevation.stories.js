export default {
  title: "Design system/Foundations/Elevation",
  parameters: {
    docs: {
      description: {
        component: "Material 3 elevation tokens (`--md-sys-elevation-level*`).",
      },
    },
  },
};

export const Levels = () => `<div class="sb-fd-elev-demo">
  <div>
    <div class="sb-fd-elev-card sb-fd-elev-card--1"></div>
    <p class="muted sb-fd-type-sample">Level 1</p>
  </div>
  <div>
    <div class="sb-fd-elev-card sb-fd-elev-card--2"></div>
    <p class="muted sb-fd-type-sample">Level 2</p>
  </div>
  <div>
    <div class="sb-fd-elev-card sb-fd-elev-card--3"></div>
    <p class="muted sb-fd-type-sample">Level 3</p>
  </div>
</div>`;

Levels.storyName = "Elevation levels";
