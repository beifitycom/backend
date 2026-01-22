// Quick test script for SWIFT API
// Run with: node test_swift.js YOUR_TRANSACTION_REFERENCE

import fetch from 'node-fetch';

const reference = process.argv[2];
if (!reference) {
  console.log('Usage: node test_swift.js <transaction_reference>');
  process.exit(1);
}

console.log(`Testing SWIFT API for reference: ${reference}`);

async function testSwiftApi() {
  try {
    const apiKey = process.env.SWIFT_API_KEY || 'sw_f451ace91b204841269a03acd7df428a635b98fc44d49d54af5aa8b3'; // Use the key from your example
    const response = await fetch('https://swiftwallet.co.ke/v3/transactions/', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('SWIFT API Response Status:', response.status);
    console.log('Raw SWIFT API response:', JSON.stringify(data, null, 2));

    // Look for the specific transaction - SWIFT API structure: { success: true, data: { transactions: [...] } }
    let transactions = [];
    if (data && data.success && data.data && Array.isArray(data.data.transactions)) {
      transactions = data.data.transactions;
    } else if (data && data.success && Array.isArray(data.transactions)) {
      transactions = data.transactions;
    } else if (Array.isArray(data)) {
      transactions = data;
    } else if (data && Array.isArray(data.data)) {
      transactions = data.data;
    }

    console.log(`Found ${transactions.length} transactions in response`);

    const ourTransaction = transactions.find(tx => tx.external_reference === reference);
    if (ourTransaction) {
      console.log('✅ Found our transaction:', JSON.stringify(ourTransaction, null, 2));
      console.log(`Status: ${ourTransaction.status}`);
      console.log(`Amount: ${ourTransaction.amount}`);
      console.log(`Transaction Date: ${ourTransaction.transaction_date}`);
      console.log(`Processed At: ${ourTransaction.processed_at}`);
      console.log(`Is completed: ${ourTransaction.status === 'completed' || ourTransaction.status === 'success'}`);
      console.log(`M-Pesa Receipt: ${ourTransaction.mpesa_receipt_number}`);
    } else {
      console.log(`❌ Transaction with reference ${reference} not found in SWIFT response`);
      console.log('Sample external_references found:', transactions.slice(0, 5).map(tx => tx.external_reference).filter(Boolean));
      console.log('All statuses found:', [...new Set(transactions.map(tx => tx.status))]);
    }

  } catch (error) {
    console.error('❌ SWIFT API test error:', error);
  }
}

testSwiftApi();
