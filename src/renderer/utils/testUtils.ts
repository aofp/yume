// Test utilities to verify all features work

import { useStore } from '../stores/useStore';

export const runTests = async () => {
  console.log('🧪 Running Claude Code Studio Tests...');
  
  const store = useStore.getState();
  const results: string[] = [];
  
  // Test 1: Create Session
  try {
    await store.createSession('Test Session');
    results.push('✅ Session creation works');
  } catch (error) {
    results.push(`❌ Session creation failed: ${error}`);
  }
  
  // Test 2: Add Todo
  try {
    store.addTodo('Test todo item');
    results.push('✅ Todo creation works');
  } catch (error) {
    results.push(`❌ Todo creation failed: ${error}`);
  }
  
  // Test 3: Send Message
  try {
    if (store.currentSession) {
      await store.sendMessage('Test message');
      results.push('✅ Message sending works');
    } else {
      results.push('⚠️ No session available for message test');
    }
  } catch (error) {
    results.push(`❌ Message sending failed: ${error}`);
  }
  
  // Test 4: Update Settings
  try {
    store.updateSettings({ temperature: 0.8 });
    results.push('✅ Settings update works');
  } catch (error) {
    results.push(`❌ Settings update failed: ${error}`);
  }
  
  // Test 5: Set Permission
  try {
    store.setPermission('edit', 'allow');
    results.push('✅ Permission setting works');
  } catch (error) {
    results.push(`❌ Permission setting failed: ${error}`);
  }
  
  console.log('Test Results:', results);
  return results;
};

// Auto-run tests in development
// Disabled - run manually if needed
// if (process.env.NODE_ENV === 'development') {
//   setTimeout(() => {
//     runTests();
//   }, 2000);
// }