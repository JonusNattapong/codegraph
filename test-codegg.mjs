import { CodeGG } from './dist/index.js';

const cg = new CodeGG({ projectRoot: process.cwd() });
try {
  await cg.init();
  console.log('init OK');
  await cg.indexAll();
  console.log('index OK');
} catch (e) {
  console.error('Error:', e.message, e.stack);
}
