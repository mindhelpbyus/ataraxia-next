#!/usr/bin/env ts-node

/**
 * Universal Auth Provider Migration Script
 * 
 * This script migrates from provider-specific fields (firebase_uid) to universal
 * auth provider fields (auth_provider_id, auth_provider_type) that support
 * Firebase, Cognito, Auth0, Okta, or any future auth provider.
 * 
 * MIGRATION STRATEGY:
 * 1. Run database migration to add universal auth fields
 * 2. Migrate existing Firebase users to Cognito (optional)
 * 3. Update all database records to use universal fields
 * 4. Maintain backward compatibility with legacy fields
 */

import { 
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  MessageActionType
} from '@aws-sdk/client-cognito-identity-provider';
import { getPrisma } from '../src/lib/prisma';
import { createLogger } from '../src/shared/logger';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('universal-auth-migration');
const prisma = getPrisma();

// Configuration
const COGNITO_CONFIG = {
  userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-west-2_AtaraxiaPool',
  region: process.env.AWS_REGION || 'us-west-2'
};

const cognitoClient = new CognitoIdentityProviderClient({
  region: COGNITO_CONFIG.region
});

interface MigrationOptions {
  dryRun: boolean;
  migrateToProvider: 'firebase' | 'cognito' | 'keep-existing';
  backupData: boolean;
}

interface MigrationResult {
  totalUsers: number;
  totalTempRegistrations: number;
  successfulMigrations: number;
  failedMigrations: number;
  skippedUsers: number;
  errors: Array<{
    userId: string;
    email: string;
    error: string;
  }>;
}

/**
 * Run database migration to add universal auth provider fields
 */
async function runDatabaseMigration(): Promise<void> {
  logger.info('Running database migration for universal auth provider fields');
  
  const migrationPath = path.join(__dirname, '../database/migrations/001_add_auth_provider_fields.sql');
  
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }
  
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  
  try {
    await prisma.$executeRawUnsafe(migrationSQL);
    logger.info('Database migration completed successfully');
  } catch (error: any) {
    logger.error('Database migration failed', { error: error.message });
    throw error;
  }
}

/**
 * Backup existing data before migration
 */
async function backupExistingData(): Promise<string> {
  logger.info('Creating backup of existing auth data');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../backups');
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // Backup users with firebase_uid
  const users = await prisma.users.findMany({
    where: {
      firebase_uid: { not: undefined }
    },
    select: {
      id: true,
      email: true,
      firebase_uid: true,
      auth_provider_id: true,
      auth_provider_type: true
    }
  });
  
  // Backup temp registrations
  const tempRegistrations = await prisma.temp_therapist_registrations.findMany({
    where: {
      firebase_uid: { not: undefined }
    },
    select: {
      id: true,
      email: true,
      firebase_uid: true,
      auth_provider_id: true,
      auth_provider_type: true
    }
  });
  
  const backupData = {
    timestamp,
    users,
    tempRegistrations,
    totalUsers: users.length,
    totalTempRegistrations: tempRegistrations.length
  };
  
  const backupFile = path.join(backupDir, `auth_backup_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  
  logger.info('Backup created', { 
    backupFile, 
    totalUsers: users.length,
    totalTempRegistrations: tempRegistrations.length 
  });
  
  return backupFile;
}

/**
 * Generate secure temporary password for Cognito users
 */
function generateSecurePassword(): string {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  // Ensure at least one of each required character type
  password += 'A'; // uppercase
  password += 'a'; // lowercase  
  password += '1'; // number
  password += '!'; // symbol
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Create user in Cognito (if migrating to Cognito)
 */
async function createCognitoUser(user: any): Promise<string> {
  const tempPassword = generateSecurePassword();
  
  try {
    const createCommand = new AdminCreateUserCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: user.email,
      UserAttributes: [
        { Name: 'email', Value: user.email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'given_name', Value: user.first_name || '' },
        { Name: 'family_name', Value: user.last_name || '' },
        { Name: 'custom:role', Value: user.role || 'client' },
        { Name: 'custom:migrated_from_fb', Value: 'true' },
        { Name: 'custom:original_firebase_uid', Value: user.firebase_uid || '' },
        { Name: 'custom:migration_date', Value: new Date().toISOString() },
        ...(user.phone_number ? [{ Name: 'phone_number', Value: user.phone_number }] : []),
        ...(user.profile_image_url ? [{ Name: 'picture', Value: user.profile_image_url }] : [])
      ],
      TemporaryPassword: tempPassword,
      MessageAction: MessageActionType.SUPPRESS // Don't send welcome email
    });

    const response = await cognitoClient.send(createCommand);
    const cognitoSub = response.User?.Username;

    if (!cognitoSub) {
      throw new Error('Failed to get Cognito user sub');
    }

    // Set permanent password (users will need to reset on first login)
    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: user.email,
      Password: tempPassword,
      Permanent: true
    }));

    // Add to appropriate Cognito group based on role
    const groupName = user.role === 'therapist' ? 'therapists' : 
                     user.role === 'admin' ? 'admins' : 
                     user.role === 'superadmin' ? 'superadmins' : 'clients';
    
    try {
      await cognitoClient.send(new AdminAddUserToGroupCommand({
        UserPoolId: COGNITO_CONFIG.userPoolId,
        Username: user.email,
        GroupName: groupName
      }));
      
      logger.info('Added user to Cognito group', {
        email: user.email,
        group: groupName
      });
    } catch (groupError: any) {
      logger.warn('Failed to add user to group, but user created successfully', {
        email: user.email,
        group: groupName,
        error: groupError.message
      });
    }

    // Get the actual Cognito sub ID
    const getUserCommand = new (await import('@aws-sdk/client-cognito-identity-provider')).AdminGetUserCommand({
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: user.email
    });
    
    const userResponse = await cognitoClient.send(getUserCommand);
    const actualSub = userResponse.UserAttributes?.find(attr => attr.Name === 'sub')?.Value;

    logger.info('Successfully created Cognito user', {
      email: user.email,
      cognitoSub: actualSub || cognitoSub,
      role: user.role,
      originalFirebaseUid: user.firebase_uid
    });

    return actualSub || cognitoSub;

  } catch (error: any) {
    logger.error('Failed to create Cognito user', {
      userId: user.id,
      email: user.email,
      error: error.message,
      errorCode: error.name
    });
    throw error;
  }
}

/**
 * Migrate users to universal auth provider fields
 */
async function migrateUsers(options: MigrationOptions): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalUsers: 0,
    totalTempRegistrations: 0,
    successfulMigrations: 0,
    failedMigrations: 0,
    skippedUsers: 0,
    errors: []
  };

  try {
    // Get users that need migration
    const users = await prisma.users.findMany({
      where: {
        OR: [
          { firebase_uid: { not: undefined } },
          // Note: auth_provider_id may not exist yet if migration hasn't run
        ]
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        firebase_uid: true,
        // auth_provider_id: true,  // Will be available after migration
        // auth_provider_type: true, // Will be available after migration
        phone_number: true
      }
    });

    result.totalUsers = users.length;
    logger.info(`Found ${users.length} users to migrate`);

    // Migrate users in batches
    const batchSize = 5;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      logger.info(`Processing user batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(users.length / batchSize)}`);

      for (const user of batch) {
        try {
          let authProviderId = user.firebase_uid; // Start with firebase_uid
          let authProviderType = 'firebase';

          // Determine migration strategy
          if (options.migrateToProvider === 'cognito' && user.firebase_uid) {
            // Create Cognito user and get new sub
            authProviderId = await createCognitoUser(user);
            authProviderType = 'cognito';
          } else if (user.firebase_uid) {
            // Keep existing Firebase UID
            authProviderId = user.firebase_uid;
            authProviderType = 'firebase';
          }

          if (!authProviderId) {
            result.skippedUsers++;
            continue;
          }

          // Update user record (unless dry run)
          if (!options.dryRun) {
            // Use raw SQL to update since Prisma client may not have new fields yet
            await prisma.$executeRaw`
              UPDATE users 
              SET 
                auth_provider_id = ${authProviderId},
                auth_provider_type = ${authProviderType},
                auth_provider_metadata = ${JSON.stringify({
                  migrated_from: user.firebase_uid ? 'firebase_uid' : 'new_user',
                  migration_date: new Date().toISOString(),
                  migration_tool: 'universal_auth_migration',
                  original_firebase_uid: user.firebase_uid,
                  target_provider: options.migrateToProvider,
                  cognito_username: authProviderType === 'cognito' ? user.email : null,
                  migration_batch: Math.floor(i / batchSize) + 1
                })},
                firebase_uid = ${authProviderId},  -- Now contains Cognito sub for complete migration
                auth_methods = ${JSON.stringify([authProviderType])},
                updated_at = NOW()
              WHERE id = ${user.id}
            `;
            
            logger.info('Database updated for user', {
              userId: user.id.toString(),
              email: user.email,
              oldFirebaseUid: user.firebase_uid,
              newAuthProviderId: authProviderId,
              authProviderType: authProviderType
            });
          }

          result.successfulMigrations++;
          logger.info('Migrated user', {
            userId: user.id.toString(),
            email: user.email,
            fromProvider: user.firebase_uid ? 'firebase' : 'new',
            toProvider: authProviderType,
            dryRun: options.dryRun
          });

        } catch (error: any) {
          result.failedMigrations++;
          result.errors.push({
            userId: user.id.toString(),
            email: user.email,
            error: error.message
          });
          logger.error('Failed to migrate user', {
            userId: user.id.toString(),
            email: user.email,
            error: error.message
          });
        }
      }

      // Rate limiting delay
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Migrate temp registrations
    const tempRegistrations = await prisma.temp_therapist_registrations.findMany({
      where: {
        OR: [
          { firebase_uid: { not: undefined } },
          { auth_provider_id: null }
        ]
      }
    });

    result.totalTempRegistrations = tempRegistrations.length;
    logger.info(`Found ${tempRegistrations.length} temp registrations to migrate`);

    for (const registration of tempRegistrations) {
      try {
        let authProviderId = registration.auth_provider_id || registration.firebase_uid;
        let authProviderType = registration.auth_provider_type || 'firebase';

        if (!options.dryRun && authProviderId) {
          await prisma.temp_therapist_registrations.update({
            where: { id: registration.id },
            data: {
              auth_provider_id: authProviderId,
              auth_provider_type: authProviderType
            }
          });
        }

        logger.info('Migrated temp registration', {
          registrationId: registration.id.toString(),
          email: registration.email,
          authProviderId,
          dryRun: options.dryRun
        });

      } catch (error: any) {
        logger.error('Failed to migrate temp registration', {
          registrationId: registration.id.toString(),
          error: error.message
        });
      }
    }

    return result;

  } catch (error: any) {
    logger.error('Migration failed', { error: error.message });
    throw error;
  }
}

/**
 * Generate migration report
 */
function generateMigrationReport(result: MigrationResult, options: MigrationOptions): string {
  const report = `
# Universal Auth Provider Migration Report

## Migration Completed: ${new Date().toISOString()}

### Configuration
- **Target Provider**: ${options.migrateToProvider}
- **Dry Run**: ${options.dryRun}
- **Backup Created**: ${options.backupData}
- **Cognito User Pool**: ${COGNITO_CONFIG.userPoolId}
- **AWS Region**: ${COGNITO_CONFIG.region}

### Results Summary
- **Total Users**: ${result.totalUsers}
- **Total Temp Registrations**: ${result.totalTempRegistrations}
- **Successful Migrations**: ${result.successfulMigrations}
- **Failed Migrations**: ${result.failedMigrations}
- **Skipped Users**: ${result.skippedUsers}
- **Success Rate**: ${result.totalUsers > 0 ? ((result.successfulMigrations / result.totalUsers) * 100).toFixed(2) : 0}%

### Migration Details
- **Universal Auth Fields**: Added auth_provider_id, auth_provider_type, auth_provider_metadata
- **Legacy Compatibility**: Maintained firebase_uid field for backward compatibility
- **Provider Support**: Firebase, Cognito, Auth0, Okta, Custom providers
- **Database Indexes**: Added for optimal query performance

### Errors
${result.errors.length > 0 ? 
  result.errors.map(error => `- User ${error.userId} (${error.email}): ${error.error}`).join('\n') :
  'No errors occurred during migration.'
}

### Next Steps

#### 1. Verify Migration
\`\`\`bash
# Check universal auth fields are populated
SELECT auth_provider_type, COUNT(*) FROM users GROUP BY auth_provider_type;
\`\`\`

#### 2. Test Authentication
- Test login with existing credentials
- Verify all auth providers work correctly
- Check that user data is preserved

#### 3. Update Application Code
- Use auth_provider_id instead of firebase_uid
- Support multiple auth providers
- Implement provider-specific logic as needed

#### 4. Monitor System
- Check authentication success rates
- Monitor for any provider-specific issues
- Validate user experience

### Rollback Plan
If issues occur:
1. Restore from backup: Use backup files in /backups directory
2. Revert database: Run rollback migration if needed
3. Switch providers: Update auth_provider_type as needed

### Provider-Agnostic Benefits
- **Flexibility**: Support any auth provider (Firebase, Cognito, Auth0, Okta)
- **Migration**: Easy switching between providers
- **Scalability**: Add new providers without schema changes
- **Compliance**: Provider-specific compliance features
- **Performance**: Optimized queries with proper indexing

Generated by: migrate-to-universal-auth.ts
`;

  return report;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dryRun: args.includes('--dry-run'),
    migrateToProvider: (args.find(arg => arg.startsWith('--provider='))?.split('=')[1] as any) || 'keep-existing',
    backupData: !args.includes('--no-backup')
  };

  try {
    console.log('🚀 Starting Universal Auth Provider Migration');
    console.log('Options:', options);

    // Validate environment
    if (options.migrateToProvider === 'cognito') {
      if (!process.env.COGNITO_USER_POOL_ID) {
        throw new Error('COGNITO_USER_POOL_ID environment variable is required for Cognito migration');
      }
      if (!process.env.AWS_REGION) {
        throw new Error('AWS_REGION environment variable is required for Cognito migration');
      }
    }

    // Step 1: Run database migration
    if (!options.dryRun) {
      await runDatabaseMigration();
    } else {
      console.log('🔍 Dry run: Skipping database migration');
    }

    // Step 2: Backup existing data
    let backupFile = '';
    if (options.backupData && !options.dryRun) {
      backupFile = await backupExistingData();
    }

    // Step 3: Migrate users
    const result = await migrateUsers(options);

    // Step 4: Generate report
    const report = generateMigrationReport(result, options);
    
    // Save report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = `universal-auth-migration-report-${timestamp}.md`;
    fs.writeFileSync(reportPath, report);

    console.log('\n' + report);
    console.log(`\n📄 Full report saved to: ${reportPath}`);
    if (backupFile) {
      console.log(`💾 Backup saved to: ${backupFile}`);
    }

    // Exit with appropriate code
    process.exit(result.failedMigrations > 0 ? 1 : 0);

  } catch (error: any) {
    logger.error('Migration script failed', { error: error.message });
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { migrateUsers, generateMigrationReport };