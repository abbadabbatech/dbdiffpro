const axios = require('axios');

async function getEdgeFunctions(projectRef, token) {
  if (!token) return {};
  
  try {
    const res = await axios.get(`https://api.supabase.com/v1/projects/${projectRef}/functions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const functions = {};
    res.data.forEach(fn => {
      functions[fn.slug] = {
        name: fn.name,
        slug: fn.slug,
        status: fn.status,
        // As discussed, source code might not be available via this API,
        // but we can compare metadata.
        import_map: fn.import_map,
        verify_jwt: fn.verify_jwt
      };
    });
    return functions;
  } catch (error) {
    console.warn('Error fetching edge functions:', error.message);
    return {};
  }
}

module.exports = { getEdgeFunctions };
