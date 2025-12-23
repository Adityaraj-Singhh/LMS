const { execSync } = require('child_process');
const fs = require('fs');

console.log('🚀 Running Backend API Tests for All Roles');
console.log('===========================================\n');

async function runAllTests() {
  const tests = [
    { 
      name: 'Dean Analytics API', 
      file: 'test-dean-analytics-api.js',
      role: 'Dean (dhirendra@gmail.com)'
    },
    { 
      name: 'HOD Analytics API', 
      file: 'test-hod-analytics-api.js',
      role: 'HOD (harshit@gmail.com)'
    },
    { 
      name: 'Teacher Analytics API', 
      file: 'test-teacher-analytics-api.js',
      role: 'Teacher (palak@gmail.com)'
    }
  ];

  const results = {};

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 TEST ${i + 1}/${tests.length}: ${test.name}`);
    console.log(`👤 Role: ${test.role}`);
    console.log(`${'='.repeat(60)}`);
    
    try {
      // Check if test file exists
      if (!fs.existsSync(test.file)) {
        throw new Error(`Test file ${test.file} not found`);
      }

      // Run the test
      const output = execSync(`node ${test.file}`, { 
        encoding: 'utf8',
        timeout: 30000 // 30 second timeout
      });
      
      console.log(output);
      results[test.name] = 'PASSED';
      
    } catch (error) {
      console.error(`❌ Test failed: ${test.name}`);
      console.error(error.stdout || error.message);
      results[test.name] = 'FAILED';
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 TEST SUMMARY');
  console.log(`${'='.repeat(60)}`);
  
  Object.keys(results).forEach(testName => {
    const status = results[testName];
    const emoji = status === 'PASSED' ? '✅' : '❌';
    console.log(`${emoji} ${testName}: ${status}`);
  });
  
  const passedTests = Object.values(results).filter(r => r === 'PASSED').length;
  const totalTests = Object.keys(results).length;
  
  console.log(`\n📈 Overall Result: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed successfully!');
  } else {
    console.log('⚠️  Some tests failed - check logs above for details');
  }
}

// Make sure we have node_modules/axios
try {
  require('axios');
} catch (e) {
  console.log('📦 Installing axios dependency...');
  try {
    execSync('npm install axios', { stdio: 'inherit' });
  } catch (installError) {
    console.error('❌ Failed to install axios. Please run: npm install axios');
    process.exit(1);
  }
}

// Run all tests
runAllTests().catch(console.error);