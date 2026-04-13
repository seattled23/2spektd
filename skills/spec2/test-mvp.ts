/**
 * MVP End-to-End Test
 * 
 * Tests the basic workflow without requiring full environment setup
 */

import { execute } from './skill.js';

async function testMVP() {
  console.log('=== Spec2 MVP Test ===\n');

  try {
    await execute({
      requirements: 'Build a simple TODO list manager with add, list, and delete functions',
      language: 'typescript'
    });

    console.log('\n✅ MVP TEST PASSED');
  } catch (error) {
    console.error('\n❌ MVP TEST FAILED');
    console.error(error);
    process.exit(1);
  }
}

testMVP();
