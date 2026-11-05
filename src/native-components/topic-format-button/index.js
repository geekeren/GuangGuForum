Component({
  properties: {
    icon: { type: String, value: '' },
    label: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
    active: { type: Boolean, value: false },
    background: { type: String, value: 'transparent' },
    thumbnail: { type: Boolean, value: false },
    caption: { type: String, value: '' },
    loading: { type: Boolean, value: false },
  },
  methods: {
    // Keep the real touch event inside this native component so Editor does not
    // lose its selection/keyboard. Only a completed, unmoved touch runs an action.
    formatStart() { this.touchCancelled = false; },
    formatMove() { this.touchCancelled = true; },
    formatCancel() { this.touchCancelled = true; },
    formatEnd() {
      const cancelled = this.touchCancelled;
      this.touchCancelled = true;
      if (cancelled === false && !this.properties.disabled) this.triggerEvent('formatend');
    },
    // The tap following touchend is captured, never a second execution path.
    formatTap() {},
  },
});
