import { fireEvent, render, screen } from '@testing-library/vue';
import VueRouter from 'vue-router';
import PolicyModals from '../PolicyModals';
import { policies } from 'shared/constants';

function renderModals({ unaccepted, query = {} }) {
  const router = new VueRouter({
    routes: [{ path: '/my-channels', component: { render: h => h('div') } }],
  });
  router.push({ path: '/my-channels', query });
  const store = {
    state: { unaccepted },
    getters: { loggedIn: () => true },
    mutations: {
      ACCEPT(state, policy) {
        state.unaccepted = state.unaccepted.filter(p => p !== policy);
      },
    },
    modules: {
      policies: {
        namespaced: true,
        getters: {
          firstUnacceptedPolicy: (state, getters, rootState) => rootState.unaccepted[0] || null,
          isPolicyUnaccepted: (state, getters, rootState) => policy =>
            rootState.unaccepted.includes(policy),
          getPolicyAcceptedData: () => policy => policy,
        },
        actions: {
          acceptPolicy: ({ commit }, policy) => commit('ACCEPT', policy, { root: true }),
        },
      },
    },
  };
  render(PolicyModals, { store, routes: router });
  return router;
}

// Accepts the policy shown, as someone signing in for the first time would
async function acceptShownPolicy() {
  await fireEvent.click(screen.getByRole('checkbox', { name: 'I have agreed to the above terms' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  // Let the acceptance and any navigation settle, and an unhandled rejection surface
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('PolicyModals navigation', () => {
  let rejections;
  const onRejection = reason => rejections.push(reason);

  beforeEach(() => {
    rejections = [];
    process.on('unhandledRejection', onRejection);
  });

  afterEach(() => {
    process.off('unhandledRejection', onRejection);
  });

  it('accepts a policy that opened by itself without a navigation error', async () => {
    const router = renderModals({ unaccepted: [policies.TERMS_OF_SERVICE] });

    await acceptShownPolicy();

    expect(rejections).toEqual([]);
    expect(router.currentRoute.fullPath).toBe('/my-channels');
    expect(screen.queryByTestId('tos-modal')).not.toBeInTheDocument();
  });

  it('clears the policy opened from a link once it is accepted', async () => {
    const router = renderModals({
      unaccepted: [policies.TERMS_OF_SERVICE],
      query: { showPolicy: policies.TERMS_OF_SERVICE },
    });

    await acceptShownPolicy();

    expect(rejections).toEqual([]);
    expect(router.currentRoute.query).toEqual({});
  });
});
