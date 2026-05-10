import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { 
  Database, Zap, ArrowRight, RefreshCw, CheckCircle, AlertCircle, Code, 
  Server, Settings, LogOut, User, Plus, Trash2, Shield, Users, LogIn, Sun, Moon 
} from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Editor from '@monaco-editor/react';
import axios from 'axios';

// --- Components ---

const Sidebar = () => {
  const { profile, user, signOut } = useAuth();
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');
  
  return (
    <div className="sidebar">
      <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="gradient-text" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Database size={24} /> DB Diff Pro
        </h2>
      </div>

      <nav style={{ flex: 1 }}>
        <Link to="/" className="nav-item">
          <Zap size={18} /> Diff Engine
        </Link>
        <Link to={user ? "/targets" : "/login"} className="nav-item">
          <Server size={18} /> Saved Targets
          {!user && <span style={{ fontSize: '0.6rem', opacity: 0.5, marginLeft: 'auto' }}>Login</span>}
        </Link>
        {profile?.role >= 5 && (
          <Link to="/admin" className="nav-item">
            <Shield size={18} /> Superadmin
          </Link>
        )}
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
        <button onClick={toggleTheme} className="nav-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', marginBottom: '10px' }}>
          {theme === 'light' ? <><Moon size={18} /> Dark Mode</> : <><Sun size={18} /> Light Mode</>}
        </button>
        {user ? (
          <>
            <div className="nav-item" style={{ cursor: 'default' }}>
              <User size={18} />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile?.full_name || user.email}
                </div>
                <div style={{ fontSize: '0.7rem' }} className="badge badge-pro">
                  {profile?.subscription_tier || 'free'}
                </div>
              </div>
            </div>
            <button onClick={signOut} className="nav-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }}>
              <LogOut size={18} /> Sign Out
            </button>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            <LogIn size={18} /> Sign In
          </Link>
        )}
      </div>
    </div>
  );
};

const Layout = ({ children }) => (
  <div className="app-layout">
    <Sidebar />
    <main className="main-content">
      {children}
    </main>
  </div>
);

// --- Pages ---

const Login = ({ isSignUp = false }) => {
  const { signInWithGoogle, supabase } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(isSignUp ? 'signup' : 'login');

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const { error } = mode === 'signup' 
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
        
    if (error) setError(error.message);
    else if (mode === 'signup') alert('Check your email for the confirmation link!');
    setLoading(false);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass card" style={{ width: '100%', maxWidth: '400px' }}>
        <h2 style={{ marginBottom: '24px', textAlign: 'center' }}>
          {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
        </h2>
        {error && <div style={{ color: 'var(--error)', marginBottom: '16px', fontSize: '0.9rem' }}>{error}</div>}
        
        <form onSubmit={handleAuth}>
          <div className="input-group">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Processing...' : mode === 'signup' ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div style={{ margin: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>OR</div>

        <button onClick={signInWithGoogle} className="btn btn-outline" style={{ width: '100%', marginBottom: '15px' }}>
           Continue with Google
        </button>

        <div style={{ textAlign: 'center', fontSize: '0.9rem' }}>
            {mode === 'signup' ? (
                <span>Already have an account? <a href="#" onClick={() => setMode('login')} style={{ color: 'var(--primary)' }}>Sign In</a></span>
            ) : (
                <span>Don't have an account? <a href="#" onClick={() => setMode('signup')} style={{ color: 'var(--primary)' }}>Sign Up</a></span>
            )}
        </div>
      </div>
    </div>
  );
};

const Targets = () => {
  const { supabase, profile } = useAuth();
  const [targets, setTargets] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newTarget, setNewTarget] = useState({
    name: '', db_type: 'postgres', host: '', port: 5432, 
    username: '', password: '', database_name: ''
  });

  const fetchTargets = async () => {
    const { data } = await supabase.from('targets').select('*');
    setTargets(data || []);
  };

  useEffect(() => { fetchTargets(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (profile?.subscription_tier === 'free' || !profile) {
        alert('Please upgrade to save connection targets!');
        return;
    }
    const { error } = await supabase.from('targets').insert(newTarget);
    if (error) alert(error.message);
    else {
        setShowAdd(false);
        fetchTargets();
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
        <h1>Connection Targets</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={18} /> Add Target
        </button>
      </div>

      {showAdd && (
        <div className="glass card" style={{ marginBottom: '30px' }}>
          <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="input-group">
                <label>Name</label>
                <input value={newTarget.name} onChange={e => setNewTarget({...newTarget, name: e.target.value})} required />
            </div>
            <div className="input-group">
                <label>DB Type</label>
                <select value={newTarget.db_type} onChange={e => setNewTarget({...newTarget, db_type: e.target.value})}>
                    <option value="postgres">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                </select>
            </div>
            <div className="input-group">
                <label>Host</label>
                <input value={newTarget.host} onChange={e => setNewTarget({...newTarget, host: e.target.value})} required />
            </div>
            <div className="input-group">
                <label>Port</label>
                <input type="number" value={newTarget.port} onChange={e => setNewTarget({...newTarget, port: parseInt(e.target.value)})} required />
            </div>
            <div className="input-group">
                <label>Username</label>
                <input value={newTarget.username} onChange={e => setNewTarget({...newTarget, username: e.target.value})} required />
            </div>
            <div className="input-group">
                <label>Password</label>
                <input type="password" value={newTarget.password} onChange={e => setNewTarget({...newTarget, password: e.target.value})} required />
            </div>
            <div className="input-group">
                <label>Database Name</label>
                <input value={newTarget.database_name} onChange={e => setNewTarget({...newTarget, database_name: e.target.value})} required />
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Target</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {targets.map(t => (
          <div key={t.id} className="glass card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} /> {t.name}
              </h3>
              <span className="badge badge-pro">{t.db_type}</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <div>{t.host}:{t.port}</div>
              <div>User: {t.username}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DiffEngine = () => {
  const { user, supabase } = useAuth();
  const [source, setSource] = useState({ db_type: 'postgres', url: '', password: '', host: '', port: 5432, username: 'postgres', database: 'postgres' });
  const [target, setTarget] = useState({ db_type: 'postgres', url: '', password: '', host: '', port: 5432, username: 'postgres', database: 'postgres' });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleCompare = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session ? { Authorization: `Bearer ${session.access_token}` } : {};
      
      const res = await axios.post('/api/compare', { source, target }, { headers });
      setResults(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
        {!user && (
            <div className="glass card" style={{ marginBottom: '40px', background: 'linear-gradient(135deg, rgba(62, 207, 142, 0.1) 0%, transparent 100%)' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '15px' }}>Database Synchronization Made Simple</h1>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', maxWidth: '800px', marginBottom: '25px' }}>
                    Compare schemas between any two PostgreSQL or MySQL instances. Review differences, generate migration scripts, and synchronize with one click.
                    <br/><br/>
                    <strong>Guest Mode:</strong> You can use the engine right now. Log in to save your connection targets and access team collaboration features.
                </p>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <Link to="/login" className="btn btn-primary">Create Free Account</Link>
                    <Link to="/login" className="btn btn-outline">Sign In</Link>
                </div>
            </div>
        )}

        <h1>{user ? 'Diff Engine' : 'Try it Out'}</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Enter your database credentials below to start a comparison.</p>
        
        <div className="glass card" style={{ marginBottom: '30px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '30px' }}>
                <div>
                    <h3 style={{ marginBottom: '15px' }}>Source Database</h3>
                    <div className="input-group">
                        <label>DB Type</label>
                        <select value={source.db_type} onChange={e => setSource({...source, db_type: e.target.value})}>
                            <option value="postgres">PostgreSQL</option>
                            <option value="mysql">MySQL</option>
                        </select>
                    </div>
                    <div className="input-group">
                        <label>URL / Host</label>
                        <input value={source.url} onChange={e => setSource({...source, url: e.target.value})} placeholder="db.project.supabase.co" />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input type="password" value={source.password} onChange={e => setSource({...source, password: e.target.value})} />
                    </div>
                </div>

                <div style={{ alignSelf: 'center', opacity: 0.3 }}><ArrowRight size={32} /></div>

                <div>
                    <h3 style={{ marginBottom: '15px' }}>Target Database</h3>
                    <div className="input-group">
                        <label>DB Type</label>
                        <select value={target.db_type} onChange={e => setTarget({...target, db_type: e.target.value})}>
                            <option value="postgres">PostgreSQL</option>
                            <option value="mysql">MySQL</option>
                        </select>
                    </div>
                    <div className="input-group">
                        <label>URL / Host</label>
                        <input value={target.url} onChange={e => setTarget({...target, url: e.target.value})} placeholder="db.target.supabase.co" />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input type="password" value={target.password} onChange={e => setTarget({...target, password: e.target.value})} />
                    </div>
                </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '30px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                <button className="btn btn-primary" onClick={handleCompare} disabled={loading} style={{ padding: '12px 40px', fontSize: '1.1rem' }}>
                    {loading ? <RefreshCw className="animate-spin" /> : <Zap size={20} />}
                    {loading ? 'Analyzing...' : 'Compare Databases'}
                </button>
            </div>
        </div>
        
        {error && <div className="glass card" style={{ borderColor: 'var(--error)', color: 'var(--error)', marginBottom: '20px' }}>{error}</div>}
        
        {results && (
            <div className="animate-fade-in glass card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2>Found {results.scripts.length} Differences</h2>
                </div>
                {/* Result list logic would go here, same as before but integrated... */}
            </div>
        )}
    </div>
  );
};

// --- App Root ---

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RefreshCw className="animate-spin" /></div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout><DiffEngine /></Layout>} />
      <Route path="/targets" element={<Layout><Targets /></Layout>} />
      <Route path="/admin" element={user?.profile?.role >= 5 ? <Layout><h1>Admin Dashboard</h1></Layout> : <Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
