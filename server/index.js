const express = require('express');
const cors = require('cors');
const { getIntrospector } = require('./lib/db-factory');
const { diffMetadata } = require('./lib/differ');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Auth Middleware (Optional for some routes)
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    req.user = null;
    return next();
  }
  
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    req.user = null;
    return next();
  }

  // Fetch profile to get role
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  req.user = { ...user, profile };
  next();
};

// Strict Auth Middleware for protected routes
const requireAuth = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    next();
};

// RBAC Middleware
const requireRole = (minRole) => (req, res, next) => {
  if (!req.user?.profile || req.user.profile.role < minRole) {
    return res.status(403).json({ error: 'Forbidden: Insufficient role' });
  }
  next();
};

const { getEdgeFunctions } = require('./lib/supabase-api');

function buildConnectionString(config) {
  const { url, password, host, db_type } = config;
  if (!url || !password) return null;
  
  const match = url.match(/([a-z0-9]{20})|([a-z0-9]{11})/i);
  const ref = match ? match[0] : null;

  if (host) {
    const isPooler = host.includes('pooler.supabase.com');
    const user = (isPooler && ref) ? `postgres.${ref}` : (config.username || 'postgres');
    const port = isPooler ? '6543' : (config.port || (db_type === 'mysql' ? '3306' : '5432'));
    
    if (db_type === 'mysql') {
        return { host, user, password, database: config.database_name || config.database, port };
    }
    return `postgres://${user}:${encodeURIComponent(password)}@${host}:${port}/${config.database_name || config.database || 'postgres'}`;
  }

  if (!ref) return url;
  return `postgres://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

app.post('/api/compare', authenticate, async (req, res) => {
  const { source, target } = req.body;
  
  const sourceConfig = buildConnectionString(source);
  const targetConfig = buildConnectionString(target);

  try {
    const sourceIntrospector = getIntrospector(source.db_type, sourceConfig);
    const targetIntrospector = getIntrospector(target.db_type, targetConfig);

    const sourceMetadata = await sourceIntrospector.getMetadata();
    const targetMetadata = await targetIntrospector.getMetadata();
    
    let scripts = diffMetadata(sourceMetadata, targetMetadata);
    
    res.json({ scripts, sourceMetadata, targetMetadata });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: `DB Error: ${error.message}` });
  }
});

app.post('/api/apply', authenticate, async (req, res) => {
  const { target, sql } = req.body;
  const targetConfig = buildConnectionString(target);
  
  try {
    const introspector = getIntrospector(target.db_type, targetConfig);
    await introspector.execute(sql);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: `DB Error: ${error.message}` });
  }
});

// Targets CRUD
app.get('/api/targets', authenticate, requireAuth, async (req, res) => {
    const { data, error } = await supabase
        .from('targets')
        .select('*')
        .or(`user_id.eq.${req.user.id},team_id.not.is.null`);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/targets', authenticate, requireAuth, async (req, res) => {
    // Check current count for free users
    if (req.user.profile.subscription_tier === 'free') {
        const { count, error: countError } = await supabase
            .from('targets')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', req.user.id);
            
        if (count >= 2) {
            return res.status(403).json({ error: 'Free tier is limited to 2 targets. Upgrade to save more!' });
        }
    }

    const { data, error } = await supabase
        .from('targets')
        .insert({ ...req.body, user_id: req.user.id })
        .select()
        .single();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.use(express.static(path.join(__dirname, '../client/dist')));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
