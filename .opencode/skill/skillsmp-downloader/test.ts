import { handleUserRequest } from './src/index';

async function runTests() {
  console.log('🧪 Testing SkillsMP Downloader Skill\n');
  console.log('='.repeat(60));

  console.log('\n📋 Test 1: Search for Python skills');
  console.log('-'.repeat(60));
  const result1 = await handleUserRequest('Search for Python skills');
  console.log(result1);

  console.log('\n📋 Test 2: Search for Excel skills');
  console.log('-'.repeat(60));
  const result2 = await handleUserRequest('Find Excel skills');
  console.log(result2);

  console.log('\n📋 Test 3: Show top 10 skills');
  console.log('-'.repeat(60));
  const result3 = await handleUserRequest('Show top 10 skills');
  console.log(result3);

  console.log('\n📋 Test 4: Help message');
  console.log('-'.repeat(60));
  const result4 = await handleUserRequest('What can you do?');
  console.log(result4);

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed!\n');

  console.log('💡 To test installation (requires git):');
  console.log('   handleUserRequest("Install xlsx to cursor")');
  console.log('   handleUserRequest("Install @anthropic/pdf to opencode")');
}

runTests().catch(console.error);
