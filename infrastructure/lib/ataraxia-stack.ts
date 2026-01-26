/**
 * Ataraxia CDK Stack - Complete Infrastructure as Code
 * 
 * This stack provides the complete infrastructure for the Ataraxia healthcare platform
 * including Cognito authentication, Lambda functions, API Gateway, and monitoring.
 * 
 * Based on backend-initial architecture with healthcare-specific enhancements.
 */

import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface AtaraxiaStackProps extends cdk.StackProps {
  environment: 'local' | 'dev' | 'staging' | 'prod';
  databaseUrl?: string;
  domainName?: string;
  certificateArn?: string;
}

export class AtaraxiaStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly api: apigateway.RestApi;
  public readonly authFunction: lambda.Function;
  public readonly therapistFunction: lambda.Function;
  public readonly clientFunction: lambda.Function;
  public readonly verificationFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: AtaraxiaStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create Cognito User Pool for Healthcare Authentication
    this.userPool = this.createCognitoUserPool(environment);
    this.userPoolClient = this.createCognitoUserPoolClient(this.userPool, environment);

    // Create Cognito Groups for Role-Based Access
    this.createCognitoGroups(this.userPool);

    // Create Secrets for sensitive configuration
    const secrets = this.createSecrets(props);

    // Create Lambda execution role
    const lambdaRole = this.createLambdaExecutionRole();

    // Create Lambda Functions
    this.authFunction = this.createAuthFunction(lambdaRole, secrets, environment);
    this.therapistFunction = this.createTherapistFunction(lambdaRole, secrets, environment, props.databaseUrl || '');
    this.clientFunction = this.createClientFunction(lambdaRole, secrets, environment, props.databaseUrl || '');
    this.verificationFunction = this.createVerificationFunction(lambdaRole, secrets, environment, props.databaseUrl || '');

    // Create API Gateway
    this.api = this.createApiGateway(environment);

    // Configure API Gateway routes
    this.configureApiRoutes(this.api, this.authFunction, this.therapistFunction, this.clientFunction, this.verificationFunction);

    // Create CloudWatch monitoring
    this.createMonitoring(environment);

    // Create SSM parameters for configuration
    this.createSSMParameters(environment);

    // Output important values
    this.createOutputs();
  }

  private createCognitoUserPool(environment: string): cognito.UserPool {
    return new cognito.UserPool(this, 'AtaraxiaUserPool', {
      userPoolName: `ataraxia-healthcare-${environment}`,
      
      // Healthcare-specific sign-in configuration
      signInAliases: {
        email: true,
        username: false,
        phone: false // Disabled for healthcare privacy
      },

      // Auto-verified attributes
      autoVerify: {
        email: true
      },

      // Healthcare-grade password policy
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(1) // Short validity for security
      },

      // Account recovery
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      // Email configuration
      email: cognito.UserPoolEmail.withCognito(),

      // Custom attributes for healthcare
      customAttributes: {
        role: new cognito.StringAttribute({
          mutable: true
        }),
        license_number: new cognito.StringAttribute({
          mutable: true
        }),
        verification_status: new cognito.StringAttribute({
          mutable: true
        }),
        organization_id: new cognito.StringAttribute({
          mutable: true
        }),
        migrated_from_fb: new cognito.StringAttribute({
          mutable: false
        })
      },

      // Lambda triggers for custom logic
      lambdaTriggers: {
        // Add custom triggers here if needed
      },

      // Deletion protection for production
      deletionProtection: environment === 'prod',

      // Advanced security features
      advancedSecurityMode: environment === 'prod' 
        ? cognito.AdvancedSecurityMode.ENFORCED 
        : cognito.AdvancedSecurityMode.AUDIT,

      // Device tracking for security
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: true
      },

      // MFA configuration
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false, // Disabled for healthcare privacy
        otp: true   // TOTP apps only
      }
    });
  }

  private createCognitoUserPoolClient(userPool: cognito.UserPool, environment: string): cognito.UserPoolClient {
    return new cognito.UserPoolClient(this, 'AtaraxiaUserPoolClient', {
      userPool,
      userPoolClientName: `ataraxia-healthcare-client-${environment}`,

      // Auth flows
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: false,
        adminUserPassword: true // For admin operations
      },

      // Disable OAuth for healthcare privacy and simplicity
      generateSecret: false,
      
      // Token validity
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),

      // Security settings
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,

      // Read/write attributes
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          givenName: true,
          familyName: true,
          phoneNumber: true
        })
        .withCustomAttributes('role', 'license_number', 'verification_status', 'organization_id'),

      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          givenName: true,
          familyName: true,
          phoneNumber: true
        })
        .withCustomAttributes('role', 'license_number', 'verification_status', 'organization_id')
    });
  }

  private createCognitoGroups(userPool: cognito.UserPool): void {
    // Healthcare professional groups
    new cognito.CfnUserPoolGroup(this, 'TherapistsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'therapists',
      description: 'Licensed healthcare therapists',
      precedence: 1
    });

    new cognito.CfnUserPoolGroup(this, 'ClientsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'clients',
      description: 'Healthcare clients/patients',
      precedence: 2
    });

    new cognito.CfnUserPoolGroup(this, 'AdminsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'admins',
      description: 'System administrators',
      precedence: 0
    });

    new cognito.CfnUserPoolGroup(this, 'SuperAdminsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'superadmins',
      description: 'Super administrators',
      precedence: 0
    });
  }

  private createSecrets(props: AtaraxiaStackProps): secretsmanager.Secret {
    return new secretsmanager.Secret(this, 'AtaraxiaSecrets', {
      secretName: `ataraxia-secrets-${props.environment}`,
      description: 'Sensitive configuration for Ataraxia healthcare platform',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          databaseUrl: props.databaseUrl || 'postgresql://placeholder',
          jwtSecret: 'placeholder-jwt-secret'
        }),
        generateStringKey: 'generatedSecret',
        excludeCharacters: '"@/\\'
      }
    });
  }

  private createLambdaExecutionRole(): iam.Role {
    const role = new iam.Role(this, 'AtaraxiaLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });

    // Add Cognito permissions
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminRemoveUserFromGroup',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminGetUser',
        'cognito-idp:ListUsers',
        'cognito-idp:AdminListGroupsForUser'
      ],
      resources: [this.userPool.userPoolArn]
    }));

    // Add Secrets Manager permissions
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue'
      ],
      resources: ['*'] // Will be restricted to specific secrets
    }));

    // Add CloudWatch permissions
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'cloudwatch:PutMetricData'
      ],
      resources: ['*']
    }));

    return role;
  }

  private createAuthFunction(role: iam.Role, secrets: secretsmanager.Secret, environment: string): lambda.Function {
    return new lambda.Function(this, 'AtaraxiaAuthFunction', {
      functionName: `ataraxia-auth-${environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'lambdas/auth/handler.handler',
      code: lambda.Code.fromAsset('../dist'),
      role,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        NODE_ENV: environment,
        LOG_LEVEL: environment === 'prod' ? 'info' : 'debug',
        COGNITO_USER_POOL_ID: this.userPool.userPoolId,
        COGNITO_CLIENT_ID: this.userPoolClient.userPoolClientId,
        COGNITO_REGION: this.region,
        SECRETS_ARN: secrets.secretArn,
        AUTH_PROVIDER_TYPE: 'cognito'
      },
      logRetention: environment === 'prod' 
        ? logs.RetentionDays.ONE_MONTH 
        : logs.RetentionDays.ONE_WEEK,
      
      // Performance and monitoring
      reservedConcurrentExecutions: environment === 'prod' ? 100 : undefined,
      deadLetterQueueEnabled: true,
      
      // Security
      allowPublicSubnet: false
    });
  }

  private createTherapistFunction(role: iam.Role, secrets: secretsmanager.Secret, environment: string, databaseUrl: string): lambda.Function {
    return new lambda.Function(this, 'AtaraxiaTherapistFunction', {
      functionName: `ataraxia-therapist-${environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'lambdas/therapist/handler.handler',
      code: lambda.Code.fromAsset('../dist'),
      role,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        NODE_ENV: environment,
        LOG_LEVEL: environment === 'prod' ? 'info' : 'debug',
        DATABASE_URL: databaseUrl,
        DATABASE_SCHEMA: 'ataraxia',
        SECRETS_ARN: secrets.secretArn
      },
      logRetention: environment === 'prod' 
        ? logs.RetentionDays.ONE_MONTH 
        : logs.RetentionDays.ONE_WEEK,
      
      // Performance and monitoring
      reservedConcurrentExecutions: environment === 'prod' ? 50 : undefined,
      deadLetterQueueEnabled: true,
      
      // Security
      allowPublicSubnet: false
    });
  }

  private createClientFunction(role: iam.Role, secrets: secretsmanager.Secret, environment: string, databaseUrl: string): lambda.Function {
    return new lambda.Function(this, 'AtaraxiaClientFunction', {
      functionName: `ataraxia-client-${environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'lambdas/client/handler.handler',
      code: lambda.Code.fromAsset('../dist'),
      role,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        NODE_ENV: environment,
        LOG_LEVEL: environment === 'prod' ? 'info' : 'debug',
        DATABASE_URL: databaseUrl,
        DATABASE_SCHEMA: 'ataraxia',
        SECRETS_ARN: secrets.secretArn
      },
      logRetention: environment === 'prod' 
        ? logs.RetentionDays.ONE_MONTH 
        : logs.RetentionDays.ONE_WEEK,
      
      // Performance and monitoring
      reservedConcurrentExecutions: environment === 'prod' ? 50 : undefined,
      deadLetterQueueEnabled: true,
      
      // Security
      allowPublicSubnet: false
    });
  }

  private createVerificationFunction(role: iam.Role, secrets: secretsmanager.Secret, environment: string, databaseUrl: string): lambda.Function {
    return new lambda.Function(this, 'AtaraxiaVerificationFunction', {
      functionName: `ataraxia-verification-${environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'lambdas/verification/handler.handler',
      code: lambda.Code.fromAsset('../dist'),
      role,
      timeout: cdk.Duration.seconds(60), // Longer timeout for complex verification operations
      memorySize: 1024, // More memory for document processing
      environment: {
        NODE_ENV: environment,
        LOG_LEVEL: environment === 'prod' ? 'info' : 'debug',
        DATABASE_URL: databaseUrl,
        DATABASE_SCHEMA: 'ataraxia',
        SECRETS_ARN: secrets.secretArn,
        COGNITO_USER_POOL_ID: this.userPool.userPoolId,
        COGNITO_CLIENT_ID: this.userPoolClient.userPoolClientId,
        COGNITO_REGION: this.region,
        // Background check API configuration (placeholder)
        CHECKR_API_KEY: 'placeholder', // TODO: Add to secrets
        STERLING_API_KEY: 'placeholder' // TODO: Add to secrets
      },
      logRetention: environment === 'prod' 
        ? logs.RetentionDays.THREE_MONTHS // Longer retention for compliance
        : logs.RetentionDays.ONE_WEEK,
      
      // Performance and monitoring
      reservedConcurrentExecutions: environment === 'prod' ? 25 : undefined,
      deadLetterQueueEnabled: true,
      
      // Security
      allowPublicSubnet: false
    });
  }

  private createApiGateway(environment: string): apigateway.RestApi {
    const api = new apigateway.RestApi(this, 'AtaraxiaApi', {
      restApiName: `ataraxia-healthcare-api-${environment}`,
      description: 'Ataraxia Healthcare Platform API',
      
      // CORS configuration for healthcare app
      defaultCorsPreflightOptions: {
        allowOrigins: environment === 'prod' 
          ? ['https://app.ataraxia.health'] // Production domain
          : apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Request-ID'
        ]
      },

      // API Gateway configuration
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      },

      // Deployment options
      deployOptions: {
        stageName: environment,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: environment !== 'prod',
        metricsEnabled: true
      }
    });

    // Add throttling configuration
    if (environment === 'prod') {
      // Apply throttling using usage plan instead of stage throttling
      const usagePlan = new apigateway.UsagePlan(this, 'ApiUsagePlan', {
        name: `ataraxia-usage-plan-${environment}`,
        description: 'Usage plan for Ataraxia Healthcare API',
        throttle: {
          rateLimit: 1000,
          burstLimit: 2000
        },
        apiStages: [{
          api: api,
          stage: api.deploymentStage
        }]
      });
    }

    return api;
  }

  private configureApiRoutes(
    api: apigateway.RestApi, 
    authFunction: lambda.Function,
    therapistFunction: lambda.Function,
    clientFunction: lambda.Function,
    verificationFunction: lambda.Function
  ): void {
    // Create Lambda integrations
    const authIntegration = new apigateway.LambdaIntegration(authFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' }
    });
    
    const therapistIntegration = new apigateway.LambdaIntegration(therapistFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' }
    });
    
    const clientIntegration = new apigateway.LambdaIntegration(clientFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' }
    });

    const verificationIntegration = new apigateway.LambdaIntegration(verificationFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' }
    });

    const apiResource = api.root.addResource('api');

    // Auth routes
    const authResource = apiResource.addResource('auth');
    
    // Authentication endpoints
    authResource.addResource('register').addMethod('POST', authIntegration);
    authResource.addResource('login').addMethod('POST', authIntegration);
    authResource.addResource('logout').addMethod('POST', authIntegration);
    authResource.addResource('me').addMethod('GET', authIntegration);
    
    // Cognito-specific endpoints
    authResource.addResource('confirm').addMethod('POST', authIntegration);
    authResource.addResource('resend-code').addMethod('POST', authIntegration);
    authResource.addResource('forgot-password').addMethod('POST', authIntegration);
    authResource.addResource('confirm-new-password').addMethod('POST', authIntegration);
    
    // Phone and Google auth
    const phoneResource = authResource.addResource('phone');
    phoneResource.addResource('send-code').addMethod('POST', authIntegration);
    phoneResource.addResource('verify-code').addMethod('POST', authIntegration);
    authResource.addResource('google').addMethod('POST', authIntegration);
    
    // Therapist registration (part of auth service)
    const therapistAuthResource = authResource.addResource('therapist');
    therapistAuthResource.addResource('register').addMethod('POST', authIntegration);

    // Verification service routes
    const verificationResource = apiResource.addResource('verification');
    
    // Public verification endpoints
    verificationResource.addResource('check-duplicate').addMethod('POST', verificationIntegration);
    verificationResource.addResource('register').addMethod('POST', verificationIntegration);
    verificationResource.addResource('status').addResource('{authProviderId}').addMethod('GET', verificationIntegration);
    
    // Protected verification endpoints
    verificationResource.addResource('pending').addMethod('GET', verificationIntegration);
    
    const verificationIdResource = verificationResource.addResource('{id}');
    verificationIdResource.addResource('approve').addMethod('POST', verificationIntegration);
    verificationIdResource.addResource('reject').addMethod('POST', verificationIntegration);
    verificationIdResource.addResource('background-check').addMethod('POST', verificationIntegration);
    
    const documentsResource = verificationIdResource.addResource('documents');
    documentsResource.addMethod('GET', verificationIntegration);
    documentsResource.addMethod('POST', verificationIntegration);
    
    // Organization invite endpoints
    const orgResource = verificationResource.addResource('organization');
    const invitesResource = orgResource.addResource('invites');
    invitesResource.addMethod('GET', verificationIntegration);
    invitesResource.addMethod('POST', verificationIntegration);

    // Therapist service routes
    const therapistResource = apiResource.addResource('therapist');
    therapistResource.addMethod('GET', therapistIntegration); // Get all therapists
    
    // Enhanced therapist search
    const therapistSearchResource = therapistResource.addResource('search');
    therapistSearchResource.addMethod('GET', therapistIntegration); // Advanced search
    
    const therapistIdResource = therapistResource.addResource('{id}');
    therapistIdResource.addMethod('GET', therapistIntegration); // Get therapist by ID
    therapistIdResource.addMethod('PUT', therapistIntegration); // Update therapist
    
    const availabilityResource = therapistIdResource.addResource('availability');
    availabilityResource.addMethod('GET', therapistIntegration); // Get availability
    availabilityResource.addMethod('PUT', therapistIntegration); // Update availability
    
    // Enhanced therapist management endpoints
    const specialtiesResource = therapistIdResource.addResource('specialties');
    specialtiesResource.addMethod('PUT', therapistIntegration); // Update specialties
    
    const insuranceResource = therapistIdResource.addResource('insurance');
    insuranceResource.addMethod('PUT', therapistIntegration); // Update insurance
    
    const capacityResource = therapistIdResource.addResource('capacity');
    capacityResource.addMethod('GET', therapistIntegration); // Get capacity
    capacityResource.addMethod('PUT', therapistIntegration); // Update capacity
    
    therapistIdResource.addResource('verify').addMethod('POST', therapistIntegration); // Update verification status
    
    // Therapist-client matching
    const matchingResource = therapistResource.addResource('matching');
    const matchingClientResource = matchingResource.addResource('{clientId}');
    matchingClientResource.addMethod('GET', therapistIntegration); // Get matching therapists

    // Client service routes
    const clientResource = apiResource.addResource('client');
    clientResource.addMethod('GET', clientIntegration); // Get all clients
    
    const clientIdResource = clientResource.addResource('{id}');
    clientIdResource.addMethod('GET', clientIntegration); // Get client by ID
    clientIdResource.addMethod('PUT', clientIntegration); // Update client
    clientIdResource.addResource('assign').addMethod('POST', clientIntegration); // Assign therapist
    clientIdResource.addResource('preferences').addMethod('PUT', clientIntegration); // Update preferences

    // CORS is handled by defaultCorsPreflightOptions in the RestApi configuration
  }

  private createMonitoring(environment: string): void {
    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'AtaraxiaDashboard', {
      dashboardName: `ataraxia-healthcare-${environment}`
    });

    // Add widgets for monitoring
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Authentication Requests',
        left: [this.authFunction.metricInvocations()],
        right: [this.authFunction.metricErrors()]
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway Metrics',
        left: [this.api.metricCount()],
        right: [this.api.metricLatency()]
      })
    );

    // Alarms for production
    if (environment === 'prod') {
      new cloudwatch.Alarm(this, 'AuthFunctionErrors', {
        metric: this.authFunction.metricErrors(),
        threshold: 10,
        evaluationPeriods: 2,
        alarmDescription: 'Auth function error rate too high'
      });

      new cloudwatch.Alarm(this, 'ApiGatewayLatency', {
        metric: this.api.metricLatency(),
        threshold: 5000, // 5 seconds
        evaluationPeriods: 3,
        alarmDescription: 'API Gateway latency too high'
      });
    }
  }

  private createSSMParameters(environment: string): void {
    // Store configuration in SSM for easy access
    new ssm.StringParameter(this, 'SSMCognitoUserPoolId', {
      parameterName: `/ataraxia/${environment}/cognito/user-pool-id`,
      stringValue: this.userPool.userPoolId,
      description: 'Cognito User Pool ID for Ataraxia healthcare platform'
    });

    new ssm.StringParameter(this, 'SSMCognitoClientId', {
      parameterName: `/ataraxia/${environment}/cognito/client-id`,
      stringValue: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID for Ataraxia healthcare platform'
    });

    new ssm.StringParameter(this, 'SSMApiGatewayUrl', {
      parameterName: `/ataraxia/${environment}/api/gateway-url`,
      stringValue: this.api.url,
      description: 'API Gateway URL for Ataraxia healthcare platform'
    });
  }

  private createOutputs(): void {
    new cdk.CfnOutput(this, 'OutputUserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `AtaraxiaUserPoolId-${this.stackName}`
    });

    new cdk.CfnOutput(this, 'OutputUserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `AtaraxiaUserPoolClientId-${this.stackName}`
    });

    new cdk.CfnOutput(this, 'OutputApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: `AtaraxiaApiUrl-${this.stackName}`
    });

    new cdk.CfnOutput(this, 'OutputAuthFunctionArn', {
      value: this.authFunction.functionArn,
      description: 'Auth Lambda Function ARN',
      exportName: `AtaraxiaAuthFunctionArn-${this.stackName}`
    });
  }
}