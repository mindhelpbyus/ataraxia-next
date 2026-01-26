#!/usr/bin/env node

/**
 * Fix Therapist Search Handler
 * 
 * This script creates a working version of the advanced search
 * that works with the existing database schema.
 */

const fs = require('fs');

console.log('🔧 Fixing therapist search handler...');

// Create a simplified, working version of the advanced search
const fixedAdvancedSearch = `
/**
 * Advanced therapist search with comprehensive filtering
 * Simplified version that works with existing database schema
 */
async function handleAdvancedSearch(
  event: APIGatewayProxyEvent,
  requestId: string,
  logContext: any
): Promise<APIGatewayProxyResult> {
  const monitor = new PerformanceMonitor(logger, 'advanced_therapist_search', logContext);
  
  try {
    const {
      search,
      city,
      state,
      specialty,
      limit = '20',
      offset = '0'
    } = event.queryStringParameters || {};

    // Simplified query that works with existing schema
    let sql = \`
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.phone_number, 
        u.account_status, 
        u.profile_image_url,
        u.created_at,
        u.verification_stage,
        tp.clinical_specialties,
        tp.therapeutic_modalities,
        tp.highest_degree,
        tp.years_of_experience,
        tp.bio,
        tp.short_bio,
        tp.session_formats,
        tp.new_clients_capacity,
        tp.max_caseload_capacity,
        tp.city,
        tp.state,
        tp.gender,
        tp.languages_spoken,
        o.name as organization_name,
        tv.license_number,
        tv.license_state,
        tv.license_verified,
        tv.verification_status,
        (COALESCE(tp.new_clients_capacity, 0) > 0) as accepting_new_clients
      FROM users u
      INNER JOIN therapists tp ON u.id = tp.user_id
      LEFT JOIN organizations o ON u.organization_id = o.id
      LEFT JOIN therapist_verifications tv ON u.id = tv.user_id
      WHERE u.role = 'therapist' 
        AND u.account_status = 'active'
    \`;

    const params: any[] = [];
    let paramIndex = 1;

    // Text search across name and bio
    if (search) {
      sql += \` AND (
        LOWER(u.first_name) LIKE LOWER($\${paramIndex}) OR 
        LOWER(u.last_name) LIKE LOWER($\${paramIndex}) OR 
        LOWER(COALESCE(tp.bio, '')) LIKE LOWER($\${paramIndex}) OR
        LOWER(COALESCE(tp.short_bio, '')) LIKE LOWER($\${paramIndex})
      )\`;
      params.push(\`%\${search}%\`);
      paramIndex++;
    }

    // Location filters
    if (city) {
      sql += \` AND LOWER(COALESCE(tp.city, '')) = LOWER($\${paramIndex})\`;
      params.push(city);
      paramIndex++;
    }

    if (state) {
      sql += \` AND LOWER(COALESCE(tp.state, '')) = LOWER($\${paramIndex})\`;
      params.push(state);
      paramIndex++;
    }

    // Specialty filter (simplified JSONB check)
    if (specialty) {
      sql += \` AND (
        tp.clinical_specialties IS NOT NULL AND 
        tp.clinical_specialties::text LIKE $\${paramIndex}
      )\`;
      params.push(\`%\${specialty}%\`);
      paramIndex++;
    }

    // Order by relevance
    sql += \` ORDER BY 
      accepting_new_clients DESC,
      COALESCE(tp.years_of_experience, 0) DESC,
      u.created_at DESC
    \`;

    // Pagination
    sql += \` LIMIT $\${paramIndex} OFFSET $\${paramIndex + 1}\`;
    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const therapists = await query(sql, params);

    // Transform results for display
    const transformedTherapists = therapists.map((row: any) => {
      // Parse specialties safely
      let specialties: string[] = [];
      try {
        if (row.clinical_specialties && typeof row.clinical_specialties === 'object') {
          specialties = Object.keys(row.clinical_specialties).filter(k => 
            row.clinical_specialties[k] === true || row.clinical_specialties[k] === 'true'
          );
        }
      } catch (e) {
        // Ignore parsing errors
      }

      // Parse modalities safely
      let modalities: string[] = [];
      try {
        if (row.therapeutic_modalities && typeof row.therapeutic_modalities === 'object') {
          modalities = Object.keys(row.therapeutic_modalities).filter(k => 
            row.therapeutic_modalities[k] === true || row.therapeutic_modalities[k] === 'true'
          );
        }
      } catch (e) {
        // Ignore parsing errors
      }

      // Parse session formats safely
      let sessionFormats: string[] = [];
      try {
        if (row.session_formats && typeof row.session_formats === 'object') {
          sessionFormats = Object.keys(row.session_formats).filter(k => 
            row.session_formats[k] === true || row.session_formats[k] === 'true'
          );
        }
      } catch (e) {
        // Ignore parsing errors
      }

      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        profile_image_url: row.profile_image_url,
        bio: row.bio || '',
        short_bio: row.short_bio || '',
        highest_degree: row.highest_degree || '',
        years_of_experience: row.years_of_experience || 0,
        specialties: specialties.slice(0, 3), // Top 3 for display
        modalities: modalities.slice(0, 2), // Top 2 for display
        session_formats: sessionFormats,
        location: \`\${row.city || ''}, \${row.state || ''}\`.replace(/^,\\s*|,\\s*$/g, ''),
        accepting_new_clients: row.accepting_new_clients || false,
        new_clients_capacity: row.new_clients_capacity || 0,
        verification_status: row.verification_status || 'pending',
        license_verified: row.license_verified || false,
        organization: row.organization_name || '',
        created_at: row.created_at
      };
    });

    monitor.end(true, { count: transformedTherapists.length });
    
    return successResponse({
      therapists: transformedTherapists,
      total: transformedTherapists.length,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: transformedTherapists.length === parseInt(limit)
      },
      filters_applied: {
        search: search || null,
        city: city || null,
        state: state || null,
        specialty: specialty || null
      }
    }, 'Advanced therapist search completed', requestId);

  } catch (error: any) {
    logger.error('Advanced search error', logContext, error);
    monitor.end(false);
    return errorResponse(500, 'Failed to search therapists', requestId);
  }
}
`;

// Read the current handler
const handlerPath = 'src/lambdas/therapist/handler.ts';
let handlerContent = fs.readFileSync(handlerPath, 'utf8');

// Find and replace the handleAdvancedSearch function
const functionStart = handlerContent.indexOf('async function handleAdvancedSearch(');
const functionEnd = handlerContent.indexOf('\n}\n', functionStart) + 3;

if (functionStart === -1) {
  console.error('❌ Could not find handleAdvancedSearch function');
  process.exit(1);
}

// Replace the function
const beforeFunction = handlerContent.substring(0, functionStart);
const afterFunction = handlerContent.substring(functionEnd);
const newContent = beforeFunction + fixedAdvancedSearch + afterFunction;

// Write the fixed handler
fs.writeFileSync(handlerPath, newContent);

console.log('✅ Fixed therapist search handler');
console.log('   • Simplified SQL queries for compatibility');
console.log('   • Added safe JSONB parsing');
console.log('   • Improved error handling');
console.log('   • Added proper null checks');
console.log('');
console.log('🔄 Next steps:');
console.log('   1. npm run build');
console.log('   2. Deploy the updated handler');
console.log('   3. Test the search endpoints');
console.log('');