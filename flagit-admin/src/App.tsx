// ==============================================
// UPDATED Flagit Admin Dashboard - USER-CENTRIC VIEW WITH REAL-TIME UPDATES
// ==============================================

import { useEffect, useMemo, useState } from 'react'
import api, { setToken } from './api'
import GoogleLoginButton from './auth/GoogleLoginButton'
import {
  Shield,
  Download,
  FileText,
  ShieldAlert,
  BarChart3,
  Users,
  Eye,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react'
import type { PredictionRow, Metrics, VersionInfo } from './types'

// Recharts
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

export default function App() {
  // ================================
  // Core state
  // ================================
  const [jwt, setJwt] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [rows, setRows] = useState<PredictionRow[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [activeTab, setActiveTab] = useState<'users' | 'submissions' | 'models' | 'settings'>('users')
  
  // NEW: User-centric state
  const [users, setUsers] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [userPredictions, setUserPredictions] = useState<PredictionRow[]>([])
  const [activeView, setActiveView] = useState<'overview' | 'user-detail'>('overview')

  const [search, setSearch] = useState('')
  const [resultFilter, setResultFilter] = useState<'all' | 'phishing' | 'legitimate'>('all')
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(50)

  const [selectedRow, setSelectedRow] = useState<PredictionRow | null>(null)
  const [thresholdDraft, setThresholdDraft] = useState<number | null>(null)
  const [isSavingThreshold, setIsSavingThreshold] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  // NEW: Real-time update state
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [newDataCount, setNewDataCount] = useState(0)

  // ================================
  // Restore Login
  // ================================
  useEffect(() => {
    const storedJwt = localStorage.getItem('flagit_jwt')
    const storedEmail = localStorage.getItem('flagit_email')
    if (storedJwt) {
      setJwt(storedJwt)
      if (storedEmail) setEmail(storedEmail)
      setToken(storedJwt)
    }
  }, [])

  // ================================
  // IMPROVED Auto-refresh polling (5s) with new data detection
  // ================================
  useEffect(() => {
    if (!jwt) return;

    setToken(jwt);
    
    let lastPredictionCount = rows.length;

    const refreshData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const cacheBuster = `?t=${Date.now()}`;
        
        const [preds, m, v, usersData] = await Promise.all([
          api.get<PredictionRow[]>(`/admin/predictions${cacheBuster}`),
          api.get<Metrics>(`/admin/metrics${cacheBuster}`),
          api.get<VersionInfo>(`/version${cacheBuster}`),
          api.get<any[]>(`/admin/users${cacheBuster}`),
        ]);
        
        // Check if we have new predictions
        const currentPredictionCount = preds.data.length;
        const hasNewData = currentPredictionCount > lastPredictionCount;
        
        if (hasNewData) {
          const newItems = currentPredictionCount - lastPredictionCount;
          setNewDataCount(newItems);
          console.log(`🎉 ${newItems} new predictions detected!`);
          
          // Auto-clear the notification after 3 seconds
          setTimeout(() => setNewDataCount(0), 3000);
        }
        
        lastPredictionCount = currentPredictionCount;
        
        setRows(preds.data);
        setMetrics(m.data);
        setVersionInfo(v.data);
        setUsers(usersData.data);
        setLastRefresh(new Date());
        
        // Log the latest prediction for debugging
        if (preds.data.length > 0) {
          const latest = preds.data[0];
          console.log('📧 Latest prediction:', {
            sender: latest.sender,
            timestamp: latest.timestamp,
            result: latest.result,
            user: latest.user
          });
        }
        
      } catch (error) {
        console.error('Refresh error:', error);
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    // Initial load
    refreshData();

    // More frequent polling - every 5 seconds
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [jwt]);

  // Pick up server threshold
  useEffect(() => {
    if (versionInfo?.threshold != null) {
      setThresholdDraft(versionInfo.threshold)
    }
  }, [versionInfo])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, resultFilter])

  // ================================
  // Data fetcher
  // ================================
  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      
      const cacheBuster = `?t=${Date.now()}`;
      
      const [preds, m, v, usersData] = await Promise.all([
        api.get<PredictionRow[]>(`/admin/predictions${cacheBuster}`),
        api.get<Metrics>(`/admin/metrics${cacheBuster}`),
        api.get<VersionInfo>(`/version${cacheBuster}`),
        api.get<any[]>(`/admin/users${cacheBuster}`),
      ]);
      
      setRows(preds.data);
      setMetrics(m.data);
      setVersionInfo(v.data);
      setUsers(usersData.data);
      setLastRefresh(new Date());
      
    } catch {
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }

  // NEW: Manual refresh function
  async function forceRefresh() {
    setLoading(true);
    await refresh();
    setLoading(false);
  }

  function onLogin(token: string, emailAddress: string) {
    setJwt(token)
    setEmail(emailAddress)
    localStorage.setItem('flagit_jwt', token)
    localStorage.setItem('flagit_email', emailAddress)
  }

  function logout() {
    setJwt(null)
    setEmail(null)
    setRows([])
    setMetrics(null)
    setVersionInfo(null)
    setUsers([])
    setSelectedUser(null)
    setUserPredictions([])
    localStorage.removeItem('flagit_jwt')
    localStorage.removeItem('flagit_email')
    setToken()
  }

  // ================================
  // NEW: User Selection Handler
  // ================================
  async function handleUserSelect(user: any) {
    setSelectedUser(user.email);
    setActiveView('user-detail');
    
    try {
      const encodedEmail = encodeURIComponent(user.email);
      const response = await api.get<PredictionRow[]>(`/admin/users/${encodedEmail}/predictions`);
      setUserPredictions(response.data);
    } catch (error) {
      console.error('Failed to load user predictions:', error);
      setError('Failed to load user email data.');
    }
  }

  // NEW: Function to go back to overview
  function handleBackToOverview() {
    setActiveView('overview');
    setSelectedUser(null);
    setUserPredictions([]);
    setActiveTab('users');
  }

  // ================================
  // Export Function with Token Handling
  // ================================
  async function exportSheet() {
    try {
      setExportLoading(true);
      
      try {
        await api.get('/admin/validate-token');
      } catch (tokenError) {
        console.error('Token validation failed:', tokenError);
        alert('Your session has expired. Please log in again.');
        logout();
        return;
      }

      const res = await api.post('/admin/export-sheets');
      if (res.status === 200) {
        alert('Report exported to Google Sheets successfully!');
        if (res.data.sheet_url) {
          window.open(res.data.sheet_url, '_blank');
        }
        refresh();
      }
    } catch (err: any) {
      console.error('Export error:', err);
      const msg = err?.response?.data?.error || err?.message || 'Unknown error while exporting.';
      
      if (msg.includes('token') || msg.includes('auth') || err.response?.status === 401) {
        alert('Your session has expired. Please log out and log in again.');
        logout();
      } else {
        alert(`Export failed: ${msg}`);
      }
    } finally {
      setExportLoading(false);
    }
  }

  async function saveThreshold() {
    if (thresholdDraft == null) return;
    try {
      setIsSavingThreshold(true);
      await api.post('/admin/threshold', { threshold: thresholdDraft });
      await refresh();
    } catch {
      alert('Failed to update threshold.');
    } finally {
      setIsSavingThreshold(false);
    }
  }

  // ================================
  // Filters & Pagination
  // ================================
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesResult = resultFilter === 'all' ? true : r.result === resultFilter
      const q = search.toLowerCase()

      const matchesSearch =
        !q ||
        (r.sender || '').toLowerCase().includes(q) ||
        (r.user || '').toLowerCase().includes(q) ||
        r.email_snippet.toLowerCase().includes(q)

      return matchesResult && matchesSearch
    })
  }, [rows, resultFilter, search])

  // Calculate paginated data
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredRows.slice(startIndex, endIndex)
  }, [filteredRows, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredRows.length / itemsPerPage)

  // ================================
  // Weekly Trend Chart
  // ================================
  const trendData = useMemo(() => {
    const byDate: Record<string, { phishing: number; safe: number }> = {}

    for (const r of rows) {
      const day = r.timestamp.split(' ')[0]
      if (!byDate[day]) {
        byDate[day] = { phishing: 0, safe: 0 }
      }
      if (r.result === 'phishing') byDate[day].phishing++
      else byDate[day].safe++
    }

    const sorted = Object.keys(byDate).sort().slice(-7)
    return sorted.map((d) => ({
      day: d,
      phishing: byDate[d].phishing,
      safe: byDate[d].safe,
    }))
  }, [rows])

  const phishingRatio = useMemo(() => {
    const total = rows.length
    if (!total) return 0
    const phish = rows.filter((r) => r.result === 'phishing').length
    return Math.round((phish / total) * 100)
  }, [rows])

  // ================================
  // LOGIN SCREEN
  // ================================
  if (!jwt) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#0a0f1e] via-[#0d1327] to-[#05070d]">
        <div className="relative w-[420px] p-10 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-[0px_0px_40px_rgba(0,0,0,0.4)] animate-fadeIn">
          <div className="flex items-center justify-center gap-4 mb-3">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center border border-emerald-400/20 shadow-lg shadow-emerald-400/20 animate-float">
              <Shield className="h-6 w-6 text-emerald-400" />
            </div>
            <div className="text-left">
              <h1 className="text-3xl font-semibold text-white tracking-wide">Flagit Admin</h1>
              <p className="text-xs text-slate-300">Phishing Insight & Control Hub</p>
            </div>
          </div>
          <p className="text-slate-200 text-sm mt-4">
            Sign in with your organization Google account to access the dashboard.
          </p>
          <div className="mt-6 flex justify-center">
            <GoogleLoginButton onLogin={onLogin} />
          </div>
          <p className="text-[11px] text-slate-400 mt-4">
            Only whitelisted admin emails can access this panel.
          </p>
        </div>
      </div>
    )
  }

  // ================================
  // MAIN DASHBOARD
  // ================================
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 text-slate-50">
      {/* New Data Notification */}
      <NewDataNotification 
        count={newDataCount} 
        onDismiss={() => setNewDataCount(0)} 
      />
      
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-green-500/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-xs text-slate-300">
                Logged in as <span className="font-medium">{email}</span>
                <br />
                Last updated: {lastRefresh.toLocaleTimeString()}
                {loading && <span className="ml-2 text-yellow-400">🔄 Updating...</span>}
              </p>
              <span className="inline-flex mt-2 text-[11px] px-2 py-1 rounded-full bg-green-500/15 text-green-300 border border-green-500/30">
                System Administration - Live Gmail Phishing Insights
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={forceRefresh}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 rounded-2xl bg-blue-500 text-white text-sm font-medium shadow-lg shadow-blue-500/30 hover:bg-blue-600 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh Now'}
            </button>

            <button
              onClick={exportSheet}
              disabled={exportLoading}
              className="inline-flex items-center px-4 py-2 rounded-2xl bg-emerald-500 text-white text-sm font-medium shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Download className="h-4 w-4 mr-2" />
              {exportLoading ? 'Exporting...' : 'Export to Sheets'}
            </button>

            <button
              onClick={logout}
              className="inline-flex items-center px-3 py-2 rounded-2xl bg-red-500/10 text-red-300 text-xs font-medium border border-red-500/40 hover:bg-red-500/20 transition"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </button>
          </div>
        </header>

        <section className="grid md:grid-cols-4 gap-4">
          <CardStat
            icon={<FileText className="h-5 w-5" />}
            label="Total Classifications"
            value={metrics?.totalClassifications ?? 0}
            subtext="+12% vs last month"
          />
          <CardStat
            icon={<ShieldAlert className="h-5 w-5" />}
            label="Phishing Detected"
            value={metrics?.phishingDetected ?? 0}
            subtext="Threats blocked"
            variant="destructive"
          />
          <CardStat
            icon={<BarChart3 className="h-5 w-5" />}
            label="Accuracy Rate"
            value={`${metrics?.accuracyRate ?? 0}%`}
            subtext="User agreement"
            variant="success"
          />
          <CardStat
            icon={<Users className="h-5 w-5" />}
            label="Active Users"
            value={metrics?.activeUsers ?? 0}
            subtext="Gmail accounts analysed"
          />
        </section>

        <div className="grid lg:grid-cols-[2fr,1.4fr] gap-6">
          <section className="bg-white/5 border border-white/10 rounded-3xl shadow-2xl shadow-black/40 overflow-hidden">
            <div className="px-6 pt-6 pb-2 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-300 mb-1">System Management</p>
                  <p className="text-sm text-slate-300">
                    Monitor inbox activity, system performance & manage models.
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-200 border border-emerald-500/30">
                    Live
                  </span>
                  <span className="px-2 py-1 rounded-full bg-slate-700 text-slate-200 border border-slate-500/40">
                    Auto-refresh 5s
                  </span>
                </div>
              </div>

              <div className="flex gap-4 mt-6 border-b border-white/10 text-sm">
                {activeView === 'overview' ? (
                  <>
                    <TabButton
                      active={activeTab === 'users'}
                      onClick={() => setActiveTab('users')}
                    >
                      Active Users
                    </TabButton>
                    <TabButton
                      active={activeTab === 'submissions'}
                      onClick={() => setActiveTab('submissions')}
                    >
                      All Detections
                    </TabButton>
                    <TabButton
                      active={activeTab === 'models'}
                      onClick={() => setActiveTab('models')}
                    >
                      Model Versions
                    </TabButton>
                    <TabButton
                      active={activeTab === 'settings'}
                      onClick={() => setActiveTab('settings')}
                    >
                      System Settings
                    </TabButton>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleBackToOverview}
                      className="flex items-center gap-1 px-3 py-1 text-xs text-slate-400 hover:text-slate-200 transition"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Back to Users
                    </button>
                    <span className="text-xs text-slate-300">|</span>
                    <span className="text-xs text-slate-200 font-medium">
                      Viewing: {selectedUser}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {activeView === 'overview' && activeTab === 'users' && (
              <UsersTab 
                users={users}
                onSelectUser={handleUserSelect}
                selectedUser={selectedUser}
              />
            )}

            {activeView === 'overview' && activeTab === 'submissions' && (
              <SubmissionsTab
                rows={paginatedRows}
                filteredRows={filteredRows}
                search={search}
                setSearch={setSearch}
                resultFilter={resultFilter}
                setResultFilter={setResultFilter}
                onViewRow={setSelectedRow}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                showUserColumn={true}
              />
            )}

            {activeView === 'user-detail' && (
              <SubmissionsTab
                rows={userPredictions}
                filteredRows={userPredictions}
                search={search}
                setSearch={setSearch}
                resultFilter={resultFilter}
                setResultFilter={setResultFilter}
                onViewRow={setSelectedRow}
                currentPage={currentPage}
                totalPages={1}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                showUserColumn={false}
              />
            )}

            {activeView === 'overview' && activeTab === 'models' && (
              <ModelsTab versionInfo={versionInfo} />
            )}

            {activeView === 'overview' && activeTab === 'settings' && (
              <SettingsTab
                thresholdDraft={thresholdDraft}
                setThresholdDraft={setThresholdDraft}
                onSaveThreshold={saveThreshold}
                isSaving={isSavingThreshold}
              />
            )}
          </section>

          <section className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-white">Weekly Detection Trend</p>
                <span className="text-[11px] text-slate-300">
                  Phishing vs safe - last 7 days
                </span>
              </div>

              {trendData.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No detections yet. As users browse Gmail with Flagit, data will appear.
                </p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                      <XAxis dataKey="day" stroke="#cbd5f5" fontSize={11} />
                      <YAxis stroke="#cbd5f5" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          background: '#020617',
                          border: '1px solid #1e293b',
                          fontSize: 12,
                        }}
                        labelStyle={{ color: '#e5e7eb' }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="phishing"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name="Phishing"
                      />
                      <Line
                        type="monotone"
                        dataKey="safe"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name="Safe"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 shadow-2xl shadow-black/40">
              <p className="text-sm font-medium text-white">Inbox Risk Snapshot</p>
              <p className="text-xs text-slate-300">
                {phishingRatio}% of analysed emails are phishing.
              </p>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden my-2">
                <div
                  className="h-full bg-gradient-to-r from-red-500 via-orange-400 to-emerald-500"
                  style={{ width: `${phishingRatio}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] text-slate-400">
                <span>0%</span>
                <span>Phishing density</span>
                <span>100%</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {selectedRow && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full mx-4 p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-sm text-slate-300">Email Preview</p>
                <p className="text-xs text-slate-400">
                  Sent By:{' '}
                  <span className="font-medium text-slate-200">
                    {selectedRow.sender || 'unknown'}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setSelectedRow(null)}
                className="text-xs text-slate-400 hover:text-slate-100"
              >
                Close X
              </button>
            </div>

            <div className="flex items-center gap-2 mb-3">
              {selectedRow.result === 'phishing' ? (
                <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-300 border border-red-500/40">
                  Phishing - {Math.round(selectedRow.confidence * 100)}% confidence
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-200 border border-emerald-500/40">
                  Safe - {Math.round(selectedRow.confidence * 100)}% confidence
                </span>
              )}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 max-h-72 overflow-auto">
              <p className="text-xs text-slate-200 whitespace-pre-wrap">
                {selectedRow.email_snippet}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// NEW: New Data Notification Component
function NewDataNotification({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  if (count === 0) return null;
  
  return (
    <div className="fixed top-4 right-4 z-50 animate-bounce">
      <div className="bg-green-500 text-white px-4 py-2 rounded-2xl shadow-lg border border-green-300 flex items-center gap-2">
        <span className="text-sm font-medium">🎉 {count} new predictions!</span>
        <button 
          onClick={onDismiss}
          className="text-white hover:text-green-100 text-lg font-bold"
        >
          ×
        </button>
      </div>
    </div>
  )
}

// NEW: Users List Component
function UsersTab({ 
  users, 
  onSelectUser,
  selectedUser 
}: { 
  users: any[],
  onSelectUser: (user: any) => void,
  selectedUser: string | null
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-300">
          <span className="px-2 py-1 rounded-full bg-slate-800 border border-slate-600">
            {users.length} active users
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-slate-950/60">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-slate-400 bg-slate-900/80">
              <th className="py-2 px-3 text-left font-medium">User Email</th>
              <th className="py-2 px-3 text-left font-medium">Last Activity</th>
              <th className="py-2 px-3 text-left font-medium">Total Emails</th>
              <th className="py-2 px-3 text-left font-medium">Phishing Detected</th>
              <th className="py-2 px-3 text-left font-medium">Risk Score</th>
              <th className="py-2 px-3 text-left font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 px-3 text-center text-slate-400 text-xs">
                  No users found. Ask users to open Gmail with the Flagit extension.
                </td>
              </tr>
            )}

            {users.map((user, i) => (
              <tr
                key={i}
                className={`border-t border-slate-800/80 hover:bg-slate-900/80 transition ${
                  selectedUser === user.email ? 'bg-blue-500/10' : ''
                }`}
              >
                <td className="py-3 px-3 text-slate-100 font-medium">
                  {user.email}
                </td>
                <td className="py-3 px-3 text-slate-300">
                  {user.last_activity}
                </td>
                <td className="py-3 px-3 text-slate-200">
                  {user.total_emails}
                </td>
                <td className="py-3 px-3">
                  <span className="text-[11px] px-2 py-1 rounded-full bg-red-500/10 text-red-300 border border-red-500/40">
                    {user.phishing_count}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          user.risk_score > 30 ? 'bg-red-500' : 
                          user.risk_score > 10 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(user.risk_score, 100)}%` }}
                      />
                    </div>
                    <span className="text-slate-200 text-xs">{user.risk_score}%</span>
                  </div>
                </td>
                <td className="py-3 px-3">
                  <button
                    className="p-2 hover:bg-slate-800 rounded-xl text-slate-200"
                    title="View user emails"
                    onClick={() => onSelectUser(user)}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SubmissionsTab({
  rows,
  filteredRows,
  search,
  setSearch,
  resultFilter,
  setResultFilter,
  onViewRow,
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage,
  showUserColumn = true,
}: {
  rows: PredictionRow[]
  filteredRows: PredictionRow[]
  search: string
  setSearch: (v: string) => void
  resultFilter: 'all' | 'phishing' | 'legitimate'
  setResultFilter: (v: 'all' | 'phishing' | 'legitimate') => void
  onViewRow: (row: PredictionRow | null) => void
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  itemsPerPage: number
  showUserColumn?: boolean
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span className="px-2 py-1 rounded-full bg-slate-800 border border-slate-600">
            {filteredRows.length} detections
          </span>
          <span className="px-2 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by sender or snippet..."
            className="bg-slate-900/60 border border-slate-700 text-xs text-slate-200 px-3 py-2 rounded-2xl outline-none focus:border-emerald-500 w-full sm:w-72"
          />

          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value as 'all' | 'phishing' | 'legitimate')}
            className="bg-slate-900/60 border border-slate-700 text-xs text-slate-200 px-3 py-2 rounded-2xl outline-none focus:border-emerald-500"
          >
            <option value="all">All results</option>
            <option value="phishing">Phishing only</option>
            <option value="legitimate">Safe only</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-slate-950/60">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-slate-400 bg-slate-900/80">
              {showUserColumn && (
                <th className="py-2 px-3 text-left font-medium">User</th>
              )}
              <th className="py-2 px-3 text-left font-medium">Sent By</th>
              <th className="py-2 px-3 text-left font-medium">Email Snippet</th>
              <th className="py-2 px-3 text-left font-medium">Result</th>
              <th className="py-2 px-3 text-left font-medium">Confidence</th>
              <th className="py-2 px-3 text-left font-medium">Timestamp</th>
              <th className="py-2 px-3 text-left font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={showUserColumn ? 7 : 6} className="py-6 px-3 text-center text-slate-400 text-xs">
                  {filteredRows.length === 0 && search || resultFilter !== 'all' 
                    ? "No detections found for current filters." 
                    : "No detections yet. Ask a user to open Gmail with the Flagit extension."}
                </td>
              </tr>
            )}

            {rows.map((r, i) => (
              <tr
                key={i}
                className="border-t border-slate-800/80 hover:bg-slate-900/80 transition"
              >
                {showUserColumn && (
                  <td className="py-3 px-3 text-slate-300 font-medium">
                    {r.user || 'unknown'}
                  </td>
                )}
                <td className="py-3 px-3 text-slate-100 font-medium">
                  {r.sender || 'unknown'}
                </td>
                <td className="py-3 px-3 max-w-xs truncate text-slate-200">
                  {r.email_snippet}
                </td>

                <td className="py-3 px-3">
                  {r.result === 'phishing' ? (
                    <span className="text-[11px] px-2 py-1 rounded-full bg-red-500/10 text-red-300 border border-red-500/40">
                      Phishing
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-200 border border-emerald-500/40">
                      Safe
                    </span>
                  )}
                </td>

                <td className="py-3 px-3 text-slate-200">
                  {Math.round(r.confidence * 100)}%
                </td>

                <td className="py-3 px-3 text-slate-400">
                  {r.timestamp}
                </td>

                <td className="py-3 px-3">
                  <button
                    className="p-2 hover:bg-slate-800 rounded-xl text-slate-200"
                    title="View details"
                    onClick={() => onViewRow(r)}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div className="text-xs text-slate-400">
            Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredRows.length)} of {filteredRows.length} entries
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            
            <span className="text-xs text-slate-300 px-3">
              Page {currentPage} of {totalPages}
            </span>
            
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ModelsTab({ versionInfo }: { versionInfo: VersionInfo | null }) {
  return (
    <div className="p-6 space-y-4 text-sm text-slate-200">
      <p className="text-slate-300">
        This section summarizes the currently deployed phishing detection model.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
          <h3 className="font-semibold text-white text-sm">Current Model Version</h3>
          {versionInfo ? (
            <>
              <p className="text-xs text-slate-300">
                <span className="font-medium">Threshold:</span> {versionInfo.threshold.toFixed(2)}
              </p>
              <p className="text-xs text-slate-300">
                <span className="font-medium">BERT path:</span> {versionInfo.bert_model}
              </p>
              <p className="text-xs text-slate-300">
                <span className="font-medium">LR path:</span> {versionInfo.lr_model}
              </p>
              <p className="text-[11px] text-slate-400">
                BERT last updated: {versionInfo.bert_last_modified} <br />
                LR last updated: {versionInfo.lr_last_modified}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-400">Model metadata not available yet.</p>
          )}
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
          <h3 className="font-semibold text-white text-sm">Deployment Notes</h3>
          <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
            <li>Model optimized for Gmail-like email text.</li>
            <li>Chrome extension feeds real-time predictions.</li>
            <li>Threshold adjustable in System Settings.</li>
            <li>Future versions may include F1 & training logs.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function SettingsTab({
  thresholdDraft,
  setThresholdDraft,
  onSaveThreshold,
  isSaving,
}: {
  thresholdDraft: number | null
  setThresholdDraft: (v: number | null) => void
  onSaveThreshold: () => void
  isSaving: boolean
}) {
  return (
    <div className="p-6 grid md:grid-cols-3 gap-5 text-sm text-slate-200">
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 md:col-span-2 space-y-3">
        <h3 className="font-semibold text-white text-sm">Confidence Threshold</h3>
        <p className="text-xs text-slate-300">
          Adjust the minimum confidence required for an email to be flagged as phishing.
        </p>
        <div className="flex items-center gap-3 mt-2">
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.01}
            value={thresholdDraft ?? 0.5}
            onChange={(e) => setThresholdDraft(parseFloat(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <span className="text-xs w-16 text-center bg-slate-800 rounded-xl px-2 py-1 border border-slate-600">
            {(thresholdDraft ?? 0.5).toFixed(2)}
          </span>
        </div>
        <button
          onClick={onSaveThreshold}
          disabled={isSaving}
          className="mt-3 inline-flex items-center px-3 py-2 rounded-2xl bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save threshold'}
        </button>
      </div>
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
        <h3 className="font-semibold text-white text-sm">Alerts & Data</h3>
        <p className="text-xs text-slate-300">
          Future controls for notifications, retention and domain policies.
        </p>
        <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
          <li>Slack/Teams alerts for spikes</li>
          <li>Prediction retention limits</li>
          <li>Domain allowlisting</li>
        </ul>
      </div>
    </div>
  )
}

function CardStat({
  icon,
  label,
  value,
  subtext,
  variant,
}: {
  icon: React.ReactNode
  label: string
  value: any
  subtext: string
  variant?: 'destructive' | 'success'
}) {
  const colorClasses =
    variant === 'destructive'
      ? 'text-red-400'
      : variant === 'success'
      ? 'text-emerald-400'
      : 'text-slate-50'

  return (
    <div className="bg-white/5 border border-white/10 rounded-3xl p-4 shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 text-slate-300 text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-3xl font-semibold mt-2 ${colorClasses}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-1">{subtext}</div>
    </div>
  )
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 -mb-px text-xs font-medium transition ${
        active
          ? 'border-b-2 border-emerald-500 text-emerald-300'
          : 'text-slate-400 hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  )
}