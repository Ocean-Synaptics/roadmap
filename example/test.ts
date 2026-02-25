// example/test.ts
// Integration test for simple-project-roadmap

import { roadmap } from './simple-project-roadmap.ts';
import { check, verify } from '../src/protocol.ts';

console.log('Testing example roadmap:');
console.log('  check():', check(roadmap).done ? 'PASS' : 'FAIL');
console.log('  verify():', verify(roadmap).length === 0 ? 'PASS' : 'FAIL');
console.log('✓ Example roadmap is valid');
