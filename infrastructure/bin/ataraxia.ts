#!/usr/bin/env node

/**
 * Ataraxia CDK App - Healthcare Platform Infrastructure
 * 
 * This CDK app deploys the complete Ataraxia healthcare platform infrastructure
 * including Cognito authentication, Lambda functions, API Gateway, and monitoring.
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AtaraxiaStack } from '../lib/ataraxia-stack';

const app = new cdk.App();

// Get environment from context or default to dev
const environment = app.node.tryGetContext('environment') || 'dev';
const account = app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID;
const region = app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-west-2';

// Environment-specific configuration
const contextDatabaseUrl = app.node.tryGetContext('databaseUrl');

// Environment-specific configuration
const envConfig = {
  local: {
    databaseUrl: contextDatabaseUrl || 'postgresql://ataraxia_user:ataraxia_password@localhost:5432/ataraxia_db'
  },
  dev: {
    databaseUrl: contextDatabaseUrl || process.env.DATABASE_URL || 'postgresql://app_user:ChangeMe123!@dev-db-cluster.cluster-cliy2m6q8h4h.us-west-2.rds.amazonaws.com:5432/ataraxia_db?schema=ataraxia'
  },
  staging: {
    databaseUrl: process.env.STAGING_DATABASE_URL || 'postgresql://placeholder'
  },
  prod: {
    databaseUrl: process.env.PROD_DATABASE_URL || 'postgresql://placeholder',
    domainName: 'api.ataraxia.health',
    certificateArn: process.env.CERTIFICATE_ARN
  }
};

// Create the stack
new AtaraxiaStack(app, `AtaraxiaStack-${environment}`, {
  env: {
    account,
    region
  },
  environment: environment as 'local' | 'dev' | 'staging' | 'prod',
  ...envConfig[environment as keyof typeof envConfig],

  // Stack configuration
  stackName: `ataraxia-healthcare-${environment}`,
  description: `Ataraxia Healthcare Platform - ${environment.toUpperCase()} environment`,

  // Tags for resource management
  tags: {
    Project: 'Ataraxia',
    Environment: environment,
    Platform: 'Healthcare',
    ManagedBy: 'CDK',
    CostCenter: 'Healthcare-IT',
    Compliance: 'HIPAA'
  }
});

// Add global tags
cdk.Tags.of(app).add('Project', 'Ataraxia');
cdk.Tags.of(app).add('Platform', 'Healthcare');
cdk.Tags.of(app).add('ManagedBy', 'CDK');