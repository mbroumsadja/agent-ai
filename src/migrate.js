import store from './store/index.js';
import { config } from './config.js';

await store.init();
console.log(`Migration OK (${config.DB_DRIVER}, dimension ${config.EMBEDDING_DIM})`);
await store.close();
