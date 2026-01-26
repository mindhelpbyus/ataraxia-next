#!/usr/bin/env node

/**
 * Test script for therapist registration endpoint
 * This script tests the authentication flow for therapist registration
 */

const fetch = require('node-fetch');

async function testTherapistRegistration() {
  console.log('🧪 Testing Therapist Registration Endpoint');
  console.log('==========================================');

  const API_URL = 'http://localhost:3010';

  // First, let's test if we can register a user and get a token
  console.log('\n1. Testing user registration...');
  
  const registerPayload = {
    email: 'test-therapist@example.com',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'Therapist',
    role: 'therapist',
    phoneNumber: '9999999999',
    countryCode: '+1'
  };

  try {
    const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(registerPayload)
    });

    console.log('📡 Register Response Status:', registerResponse.status);

    if (registerResponse.ok) {
      const registerResult = await registerResponse.json();
      console.log('✅ Registration successful:', registerResult.message);
    } else {
      const registerError = await registerResponse.json();
      console.log('❌ Registration failed:', registerError.message);
      
      // If user already exists, try to login instead
      if (registerError.message?.includes('already registered')) {
        console.log('\n2. User exists, trying login...');
        
        const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: registerPayload.email,
            password: registerPayload.password
          })
        });

        console.log('📡 Login Response Status:', loginResponse.status);

        if (loginResponse.ok) {
          const loginResult = await loginResponse.json();
          console.log('✅ Login successful');
          
          // Test therapist registration with the token
          await testTherapistRegistrationWithToken(loginResult.token);
        } else {
          const loginError = await loginResponse.json();
          console.log('❌ Login failed:', loginError.message);
        }
      }
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function testTherapistRegistrationWithToken(token) {
  console.log('\n3. Testing therapist registration with token...');
  
  const API_URL = 'http://localhost:3010';
  
  const therapistPayload = {
    authProviderId: 'test-auth-id',
    email: 'test-therapist@example.com',
    firstName: 'Test',
    lastName: 'Therapist',
    gender: 'prefer-not-to-say',
    dateOfBirth: '1990-01-01',
    countryCode: '+1',
    phoneNumber: '9999999999',
    address1: '123 Test St',
    city: 'Test City',
    state: 'CA',
    zipCode: '12345',
    country: 'US',
    timezone: 'America/Los_Angeles',
    languages: ['English'],
    licenseType: 'LMFT',
    licenseNumber: 'TEST123456',
    issuingStates: ['CA'],
    licenseExpiryDate: '2025-12-31',
    specialties: ['anxiety', 'depression'],
    therapeuticModalities: {
      cbt: true,
      dbt: false
    },
    sessionFormats: {
      video: true,
      inPerson: false
    },
    weeklySchedule: {},
    shortBio: 'Test therapist bio',
    extendedBio: 'Extended test bio',
    whatClientsCanExpected: 'What clients can expect',
    myApproachToTherapy: 'My approach to therapy'
  };

  try {
    const response = await fetch(`${API_URL}/api/auth/therapist/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(therapistPayload)
    });

    console.log('📡 Therapist Registration Response Status:', response.status);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Therapist registration successful:', result.message);
    } else {
      const error = await response.json();
      console.log('❌ Therapist registration failed:', error.message);
      console.log('📋 Error details:', error);
    }
  } catch (error) {
    console.error('❌ Therapist registration test failed:', error.message);
  }
}

// Run the test
testTherapistRegistration().catch(console.error);