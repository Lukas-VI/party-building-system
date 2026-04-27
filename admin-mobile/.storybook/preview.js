import Vant from 'vant';
import 'vant/lib/index.css';
import '../src/style.css';

export const decorators = [
  (story) => ({
    components: { story },
    template: '<div class="storybook-mobile-shell"><story /></div>',
  }),
];

export const setup = (app) => {
  app.use(Vant);
};

export const parameters = {
  layout: 'centered',
  viewport: {
    defaultViewport: 'mobile1',
  },
};
