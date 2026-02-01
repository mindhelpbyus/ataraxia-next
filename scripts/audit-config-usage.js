#!/usr/bin/env node
/**
 * Audit Configuration Usage
 * Searches codebase for usage of each configuration key
 */

const { execSync } = require('child_process');
const { Client } = require('pg');
require('dotenv').config();

async function auditConfigUsage() {
    console.log('🔍 Auditing Configuration Usage...\n');

    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();

        // Get all configs from database
        const result = await client.query(`
            SELECT config_key, config_value, description
            FROM ataraxia.system_configs
            ORDER BY config_key
        `);

        console.log(`Found ${result.rows.length} configurations to audit\n`);
        console.log('Searching codebase for usage...\n');

        const usageReport = [];

        for (const row of result.rows) {
            const key = row.config_key;

            // Search for usage in codebase (case-insensitive)
            let usageCount = 0;
            let files = [];

            try {
                // Search in src directory
                const grepResult = execSync(
                    `grep -r -i "${key}" src/ --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" 2>/dev/null || true`,
                    { encoding: 'utf-8', cwd: '/Users/cvp/anti-gravity/Ataraxia-Next' }
                );

                if (grepResult) {
                    const lines = grepResult.trim().split('\n').filter(l => l);
                    usageCount = lines.length;
                    files = [...new Set(lines.map(l => l.split(':')[0]))];
                }
            } catch (error) {
                // No matches found
            }

            // Also check for uppercase/lowercase variations
            const variations = [
                key.toUpperCase(),
                key.toLowerCase(),
                key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')
            ];

            for (const variant of variations) {
                if (variant === key) continue;

                try {
                    const variantResult = execSync(
                        `grep -r "${variant}" src/ --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" 2>/dev/null || true`,
                        { encoding: 'utf-8', cwd: '/Users/cvp/anti-gravity/Ataraxia-Next' }
                    );

                    if (variantResult) {
                        const lines = variantResult.trim().split('\n').filter(l => l);
                        usageCount += lines.length;
                        files.push(...lines.map(l => l.split(':')[0]));
                    }
                } catch (error) {
                    // No matches
                }
            }

            files = [...new Set(files)];

            const status = usageCount > 0 ? '✅ USED' : '⚠️  UNUSED';
            const icon = usageCount > 0 ? '✅' : '⚠️ ';

            usageReport.push({
                key,
                used: usageCount > 0,
                usageCount,
                files: files.slice(0, 3), // Show first 3 files
                description: row.description
            });

            console.log(`${icon} ${key}: ${status} (${usageCount} references in ${files.length} files)`);
            if (files.length > 0 && files.length <= 3) {
                files.forEach(f => console.log(`     - ${f}`));
            } else if (files.length > 3) {
                files.slice(0, 3).forEach(f => console.log(`     - ${f}`));
                console.log(`     ... and ${files.length - 3} more files`);
            }
        }

        // Summary
        const used = usageReport.filter(r => r.used).length;
        const unused = usageReport.filter(r => !r.used).length;

        console.log(`\n📊 Audit Summary:`);
        console.log(`   ✅ Used: ${used} configurations`);
        console.log(`   ⚠️  Unused: ${unused} configurations`);

        if (unused > 0) {
            console.log(`\n⚠️  Potentially Unused Configurations:`);
            usageReport.filter(r => !r.used).forEach(r => {
                console.log(`   - ${r.key}: ${r.description || 'No description'}`);
            });
            console.log(`\n⚠️  WARNING: Review these before removing!`);
            console.log(`   They may be used in:`)
            console.log(`   - Frontend (Ataraxia/src)`);
            console.log(`   - Mobile app`);
            console.log(`   - External services`);
            console.log(`   - Environment-specific configs`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

auditConfigUsage();
