import { createStore } from './store.js';

const store = createStore();

console.log(`Seeded ${store.experts.length} experts and ${store.slots.length} future slots.`);
