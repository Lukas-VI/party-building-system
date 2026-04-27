/** @type { import('@storybook/vue3-vite').StorybookConfig } */
const config = {
  stories: ['../src/**/*.stories.@(js|vue)'],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  docs: {},
};

export default config;
