#!/usr/bin/env node

/**
 * Create Schema-Compatible Therapist Handler
 * 
 * This script creates a therapist handler that works with the actual database schema.
 */

const fs = require('fs');

console.log('🔧 Creating schema-compatible therapist handler...');

// Create the working advanced search function
const workingAdvancedSearch = `
/**
 * Advanced therapist search - Compatible with actual database schema
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

    // Query using actual column names from the schema
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
        -- Actual therapist columns
        tp.bio_short,
        tp.bio_extended,
        tp.short_bio,
        tp.extended_bio,
        tp.approach_description,
        tp.what_to_expect_description,
        tp.clinical_specialties,
        tp.therapeutic_modalities,
        tp.personal_style,
        tp.demographic_preferences,
        tp.highest_degree,
        tp.years_of_experience,
        tp.session_formats,
        tp.new_clients_capacity,
        tp.max_caseload_capacity,
        tp.session_capacity_weekly,
        tp.emergency_same_day_capacity,
        tp.insurance_panels_accepted,
        tp.accepted_insurances,
        tp.medicaid_acceptance,
        tp.medicare_acceptance,
        tp.self_pay_accepted,
        tp.sliding_scale,
        tp.languages_spoken,
        tp.timezone,
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
        AND COALESCE(u.account_status, 'active') = 'active'
        AND COALESCE(u.is_active, true) = true
    \`;

    const params: any[] = [];
    let paramIndex = 1;

    // Text search across name and bio fields
    if (search) {
      sql += \` AND (
        LOWER(u.first_name) LIKE LOWER($\${paramIndex}) OR 
        LOWER(u.last_name) LIKE LOWER($\${paramIndex}) OR 
        LOWER(COALESCE(tp.bio_short, '')) LIKE LOWER($\${paramIndex}) OR
        LOWER(COALESCE(tp.bio_extended, '')) LIKE LOWER($\${paramIndex}) OR
        LOWER(COALESCE(tp.short_bio, '')) LIKE LOWER($\${paramIndex}) OR
        LOWER(COALESCE(tp.extended_bio, '')) LIKE LOWER($\${paramIndex})
      )\`;
      params.push(\`%\${search}%\`);
      paramIndex++;
    }

    // Specialty filter (JSONB check)
    if (specialty) {
      sql += \` AND (
        tp.clinical_specialties IS NOT NULL AND 
        tp.clinical_specialties::text ILIKE $\${paramIndex}
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

    // Transform results safely
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

      // Get the best available bio
      const bio = row.bio_extended || row.extended_bio || row.bio_short || row.short_bio || '';

      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        profile_image_url: row.profile_image_url,
        bio: bio,
        short_bio: row.bio_short || row.short_bio || '',
        highest_degree: row.highest_degree || '',
        years_of_experience: row.years_of_experience || 0,
        specialties: specialties.slice(0, 3),
        modalities: modalities.slice(0, 2),
        session_formats: sessionFormats,
        accepting_new_clients: row.accepting_new_clients || false,
        new_clients_capacity: row.new_clients_capacity || 0,
        session_capacity_weekly: row.session_capacity_weekly || 0,
        verification_status: row.verification_status || 'pending',
        license_verified: row.license_verified || false,
        organization: row.organization_name || '',
        languages_spoken: Array.isArray(row.languages_spoken) ? row.languages_spoken : 
                         (row.languages_spoken ? [row.languages_spoken] : []),
        timezone: row.timezone || 'UTC',
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
if (functionStart === -1) {
  console.error('❌ Could not find handleAdvancedSearch function');
  process.exit(1);
}

// Find the end of the function (look for the closing brace)
let braceCount = 0;
let functionEnd = functionStart;
let inFunction = false;

for (let i = functionStart; i < handlerContent.length; i++) {
  const char = handlerContent[i];
  
  if (char === '{') {
    braceCount++;
    inFunction = true;
  } else if (char === '}') {
    braceCount--;
    if (inFunction && braceCount === 0) {
      functionEnd = i + 1;
      break;
    }
  }
}

// Replace the function
const beforeFunction = handlerContent.substring(0, functionStart);
const afterFunction = handlerContent.substring(functionEnd);
const newContent = beforeFunction + workingAdvancedSearch + afterFunction;

// Write the fixed handler
fs.writeFileSync(handlerPath, newContent);

console.log('✅ Created schema-compatible therapist handler');
console.log('   • Uses actual column names (bio_short, bio_extended, etc.)');
console.log('   • Safe JSONB parsing with error handling');
console.log('   • Proper null checks for all fields');
console.log('   • Compatible with existing database schema');
console.log('');
console.log('🔄 Ready to build and deploy!');
console.log('');