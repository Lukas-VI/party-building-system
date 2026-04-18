import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, MessagePlugin, Select, Space, Tag } from 'tdesign-react';
import { PROCESS_GUIDANCE } from './processGuidance';

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'https://havensky.cn/DJ_api' : '/DJ_api');
const SAMPLE_ACCOUNTS = [
  { username: 'zz001', role: '组织员' },
  { username: 'zb001', role: '党支部书记' },
  { username: 'org001', role: '组织部人员' },
  { username: 'admin', role: '超级管理员' },
];
const MENU_LABELS = {
  dashboard: '工作台',
  applicants: '申请人台账',
  workflowDetail: '流程详情',
  reviews: '审核审批',
  organizations: '组织与角色',
  analytics: '统计分析',
  exports: '数据导出',
  workflowConfig: '流程配置',
};
const ROLE_OPTIONS = [
  { label: '入党申请人', value: 'applicant' },
  { label: '党支部书记', value: 'branchSecretary' },
  { label: '组织员', value: 'organizer' },
  { label: '二级单位党委/总支书记', value: 'secretary' },
  { label: '二级单位党委/总支副书记', value: 'deputySecretary' },
  { label: '校党委组织部人员', value: 'orgDept' },
  { label: '超级管理员', value: 'superAdmin' },
];

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('dj_admin_token') || '');
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('dj_admin_theme') || 'classic');
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 860 : false));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('dj_admin_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [activeView, setActiveView] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ orgId: '', branchId: '', stage: '', keyword: '' });
  const [selectedApplicantId, setSelectedApplicantId] = useState('');
  const [overview, setOverview] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [applicantDetail, setApplicantDetail] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [orgStats, setOrgStats] = useState([]);
  const [branchStats, setBranchStats] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [assignForm, setAssignForm] = useState({ userId: '', roleId: 'branchSecretary' });

  const menus = useMemo(() => {
    if (!user) return [];
    const base = ['dashboard', ...(user.menus || [])];
    if (!base.includes('workflowDetail')) base.push('workflowDetail');
    return Array.from(new Set(base));
  }, [user]);

  const themeClass = themeMode === 'propaganda' ? 'theme-propaganda' : 'theme-classic';

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || '请求失败');
    }
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      const payload = await response.json();
      if (payload.code !== 0) {
        throw new Error(payload.message || '请求失败');
      }
      return payload.data;
    }
    return response.blob();
  }

  useEffect(() => {
    if (!token) return;
    api('/auth/me')
      .then((result) => {
        setUser(result);
        localStorage.setItem('dj_admin_user', JSON.stringify(result));
      })
      .catch((error) => {
        MessagePlugin.error(error.message);
        localStorage.removeItem('dj_admin_token');
        localStorage.removeItem('dj_admin_user');
        setToken('');
        setUser(null);
      });
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleResize = () => setIsMobile(window.innerWidth <= 860);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshForView(activeView);
  }, [user, activeView]);

  async function refreshForView(view) {
    setLoading(true);
    try {
      if (view === 'dashboard') {
        const [overviewRes, orgRes, branchRes] = await Promise.all([api('/stats/overview'), api('/stats/by-org'), api('/stats/by-branch')]);
        setOverview(overviewRes);
        setOrgStats(orgRes);
        setBranchStats(branchRes);
      }
      if (view === 'applicants') {
        const query = new URLSearchParams(filters).toString();
        const result = await api(`/applicants${query ? `?${query}` : ''}`);
        setApplicants(result);
        const [orgRes, branchRes] = await Promise.all([api('/orgs'), api('/branches')]);
        setOrgs(orgRes);
        setBranches(branchRes);
      }
      if (view === 'workflowDetail' && selectedApplicantId) {
        const [detailRes, workflowRes] = await Promise.all([api(`/applicants/${selectedApplicantId}`), api(`/workflows/${selectedApplicantId}`)]);
        setApplicantDetail(detailRes);
        setWorkflow(workflowRes);
      }
      if (view === 'reviews') {
        const result = await api('/reviews/pending');
        setReviews(result);
      }
      if (view === 'organizations') {
        const [orgRes, branchRes, userRes] = await Promise.all([api('/orgs'), api('/branches'), api('/users')]);
        setOrgs(orgRes);
        setBranches(branchRes);
        setUsers(userRes);
      }
      if (view === 'analytics') {
        const [orgRes, branchRes, overviewRes] = await Promise.all([api('/stats/by-org'), api('/stats/by-branch'), api('/stats/overview')]);
        setOrgStats(orgRes);
        setBranchStats(branchRes);
        setOverview(overviewRes);
      }
      if (view === 'workflowConfig') {
        const result = await api('/workflow-steps/config');
        setConfigs(result);
      }
    } catch (error) {
      MessagePlugin.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(form) {
    try {
      const result = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || '登录失败');
        }
        return response.json();
      });
      setToken(result.data.token);
      setUser(result.data.user);
      localStorage.setItem('dj_admin_token', result.data.token);
      localStorage.setItem('dj_admin_user', JSON.stringify(result.data.user));
      MessagePlugin.success('登录成功');
    } catch (error) {
      MessagePlugin.error(error.message);
    }
  }

  function logout() {
    localStorage.removeItem('dj_admin_token');
    localStorage.removeItem('dj_admin_user');
    setToken('');
    setUser(null);
    setSelectedApplicantId('');
    setActiveView('dashboard');
  }

  function toggleThemeMode() {
    const nextMode = themeMode === 'propaganda' ? 'classic' : 'propaganda';
    setThemeMode(nextMode);
    localStorage.setItem('dj_admin_theme', nextMode);
    MessagePlugin.success(nextMode === 'propaganda' ? '已切换到样式2' : '已切换到样式1');
  }

  async function doReview(applicantId, stepCode, status) {
    try {
      await api(`/workflows/${applicantId}/steps/${stepCode}/review`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          comment: status === 'approved' ? '后台审核通过' : '后台演示退回',
        }),
      });
      MessagePlugin.success(status === 'approved' ? '已通过' : '已退回');
      refreshForView('reviews');
    } catch (error) {
      MessagePlugin.error(error.message);
    }
  }

  async function assignRole() {
    try {
      await api('/orgs/assign-role', {
        method: 'POST',
        body: JSON.stringify(assignForm),
      });
      MessagePlugin.success('角色已分配');
    } catch (error) {
      MessagePlugin.error(error.message);
    }
  }

  async function saveConfig(stepCode, startAt, endAt) {
    try {
      await api(`/workflow-steps/config/${stepCode}`, {
        method: 'PUT',
        body: JSON.stringify({ startAt, endAt }),
      });
      MessagePlugin.success('流程配置已保存');
    } catch (error) {
      MessagePlugin.error(error.message);
    }
  }

  async function downloadFile(endpoint, fileName) {
    try {
      const blob = await api(endpoint, { headers: {} });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(url);
      MessagePlugin.success(`已下载 ${fileName}`);
    } catch (error) {
      MessagePlugin.error(error.message);
    }
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} themeClass={themeClass} onToggleTheme={toggleThemeMode} isMobile={isMobile} />;
  }

  return (
    <div className={`admin-shell ${themeClass} ${isMobile ? 'is-mobile' : ''}`}>
      <aside className="admin-sidebar">
        <div>
          <div className="brand-title">党员发展管理系统</div>
          <div className="brand-subtitle">规范发展党员全过程管理</div>
          {themeMode === 'propaganda' && <div className="brand-banner">坚持标准  严格程序  纪实留痕  逐级把关</div>}
        </div>
        <div className="sidebar-user">
          <div className="sidebar-user-name">{user.name}</div>
          <div className="sidebar-user-role">{user.roles?.map((item) => item.label).join(' / ')}</div>
          <Tag theme="danger" variant="light">{user.orgName || '全校范围'}</Tag>
        </div>
        <nav className="menu-list">
          {menus.map((item) => (
            <button key={item} className={`menu-item ${activeView === item ? 'is-active' : ''}`} onClick={() => setActiveView(item)} type="button">
              {MENU_LABELS[item]}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-settings">
            <div className="sidebar-settings-label">更多选项</div>
            <div className="sidebar-settings-value">当前：{themeMode === 'propaganda' ? '样式2' : '样式1'}</div>
            <Button size="small" theme="warning" variant="outline" onClick={toggleThemeMode}>
              切换样式
            </Button>
          </div>
          <Button variant="outline" theme="danger" onClick={logout}>退出登录</Button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="content-header">
          <div>
            <h1>{MENU_LABELS[activeView]}</h1>
            {themeMode === 'propaganda' && <div className="content-slogan">坚持政治标准 严把发展关口 规范留痕管理</div>}
          </div>
          <Tag theme="danger" variant="light">{loading ? '加载中' : '实时数据'}</Tag>
        </header>

        {activeView === 'dashboard' && overview && (
          <div className="content-stack">
            <GuidancePanel />
            <div className="stats-grid">
              <MetricCard title="申请人数" value={overview.totalApplicants} desc="当前权限范围内的申请人数量" />
              <MetricCard title="待注册审核" value={overview.pendingRegistrations} desc="首次注册待审核" />
              <MetricCard title="待流程审核" value={overview.pendingReviews} desc="流程节点待审批数量" />
              <MetricCard title="超期事项" value={overview.overdueItems} desc="超出配置截止时间的节点" />
            </div>
            <div className="split-grid">
              <SimpleTableCard title="阶段分布" columns={['阶段', '人数']} rows={overview.stageDistribution.map((item) => [item.stage, item.count])} compact={isMobile} />
              <SimpleTableCard title="单位统计" columns={['单位', '申请人数', '入门阶段', '重点审核']} rows={orgStats.map((item) => [item.orgName, item.applicants, item.pending, item.reviewing])} compact={isMobile} />
            </div>
          </div>
        )}

        {activeView === 'applicants' && (
          <div className="content-stack">
            <Card title="筛选条件">
              <div className="filter-grid">
                <Input value={filters.keyword} placeholder="姓名/学号/单位关键字" onChange={(value) => setFilters((prev) => ({ ...prev, keyword: value }))} />
                <Select value={filters.orgId} onChange={(value) => setFilters((prev) => ({ ...prev, orgId: value || '' }))} options={orgs.map((item) => ({ label: item.name, value: item.id }))} clearable placeholder="单位" />
                <Select value={filters.branchId} onChange={(value) => setFilters((prev) => ({ ...prev, branchId: value || '' }))} options={branches.map((item) => ({ label: item.name, value: item.id }))} clearable placeholder="支部" />
                <Select value={filters.stage} onChange={(value) => setFilters((prev) => ({ ...prev, stage: value || '' }))} clearable placeholder="阶段" options={['入党申请人', '入党积极分子', '发展对象', '预备党员'].map((item) => ({ label: item, value: item }))} />
              </div>
              <Space style={{ marginTop: 16 }}>
                <Button theme="danger" onClick={() => refreshForView('applicants')}>查询</Button>
                <Button variant="outline" onClick={() => downloadFile('/export/applicants', '申请人台账.xlsx')}>下载台账</Button>
              </Space>
            </Card>
            <Card title="申请人台账">
              <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>学号/工号</th>
                    <th>单位</th>
                    <th>支部</th>
                    <th>当前阶段</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {applicants.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.username}</td>
                      <td>{item.orgName}</td>
                      <td>{item.branchName}</td>
                      <td><Tag theme="danger" variant="light">{item.currentStage}</Tag></td>
                      <td>
                        <Button
                          size="small"
                          theme="danger"
                          variant="outline"
                          onClick={() => {
                            setSelectedApplicantId(item.id);
                            setActiveView('workflowDetail');
                          }}
                        >
                          查看流程
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>
          </div>
        )}

        {activeView === 'workflowDetail' && (
          <div className="content-stack">
            {!selectedApplicantId && <EmptyState text="请先在“申请人台账”中选择一名申请人。" />}
            {selectedApplicantId && applicantDetail && workflow && (
              <>
                <Card title="申请人信息">
                  <div className="detail-grid">
                    <DetailItem label="姓名" value={applicantDetail.name} />
                    <DetailItem label="学号/工号" value={applicantDetail.username} />
                    <DetailItem label="单位" value={applicantDetail.orgName} />
                    <DetailItem label="支部" value={applicantDetail.branchName} />
                    <DetailItem label="当前阶段" value={applicantDetail.currentStage} />
                    <DetailItem label="联系电话" value={applicantDetail.phone} />
                  </div>
                </Card>
                <Card title="25 步流程记录">
                  <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>步骤</th>
                        <th>名称</th>
                        <th>阶段</th>
                        <th>状态</th>
                        <th>截止时间</th>
                        <th>办理时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workflow.steps.map((item) => (
                        <tr key={item.stepCode}>
                          <td>{item.sortOrder}</td>
                          <td>{item.name}</td>
                          <td>{item.phase}</td>
                          <td><Tag theme={item.status === 'approved' ? 'success' : item.status === 'reviewing' ? 'warning' : 'default'}>{item.status}</Tag></td>
                          <td>{item.deadline}</td>
                          <td>{item.operatedAt || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {activeView === 'reviews' && (
          <Card title="待审核事项">
            <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>申请人</th>
                  <th>单位</th>
                  <th>支部</th>
                  <th>步骤</th>
                  <th>截止时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((item) => (
                  <tr key={`${item.applicantId}-${item.stepCode}`}>
                    <td>{item.applicantName}</td>
                    <td>{item.orgName}</td>
                    <td>{item.branchName}</td>
                    <td>{item.stepName}</td>
                    <td>{item.deadline}</td>
                    <td>
                      <Space>
                        <Button size="small" theme="success" onClick={() => doReview(item.applicantId, item.stepCode, 'approved')}>通过</Button>
                        <Button size="small" theme="danger" variant="outline" onClick={() => doReview(item.applicantId, item.stepCode, 'rejected')}>退回</Button>
                      </Space>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        )}

        {activeView === 'organizations' && (
          <div className="content-stack">
            <div className="split-grid">
              <SimpleTableCard title="单位清单" columns={['单位名称']} rows={orgs.map((item) => [item.name])} compact={isMobile} />
              <SimpleTableCard title="支部清单" columns={['支部名称', '所属单位']} rows={branches.map((item) => [item.name, orgs.find((org) => org.id === item.orgId)?.name || ''])} compact={isMobile} />
            </div>
            <Card title="角色分配">
              <div className="filter-grid">
                <Select value={assignForm.userId} onChange={(value) => setAssignForm((prev) => ({ ...prev, userId: value }))} options={users.map((item) => ({ label: `${item.name} (${item.username})`, value: item.id }))} placeholder="选择用户" />
                <Select value={assignForm.roleId} onChange={(value) => setAssignForm((prev) => ({ ...prev, roleId: value }))} options={ROLE_OPTIONS} placeholder="选择角色" />
              </div>
              <Button theme="danger" style={{ marginTop: 16 }} onClick={assignRole}>分配角色</Button>
            </Card>
          </div>
        )}

        {activeView === 'analytics' && (
          <div className="content-stack">
            <div className="stats-grid">
              <MetricCard title="当前统计范围" value={user.orgName || '全校'} desc="受角色权限限制" />
              <MetricCard title="流程节点待审" value={overview?.pendingReviews || 0} desc="跨单位待办汇总" />
            </div>
            <div className="split-grid">
              <SimpleTableCard title="按单位统计" columns={['单位', '申请人数', '入门阶段', '重点审核']} rows={orgStats.map((item) => [item.orgName, item.applicants, item.pending, item.reviewing])} compact={isMobile} />
              <SimpleTableCard title="按支部统计" columns={['支部', '申请人数', '活跃流程数']} rows={branchStats.map((item) => [item.branchName, item.applicants, item.activeSteps])} compact={isMobile} />
            </div>
          </div>
        )}

        {activeView === 'exports' && (
          <Card title="数据下载">
            <div className="export-actions">
              <Button theme="danger" onClick={() => downloadFile('/export/applicants', '申请人台账.xlsx')}>下载人员基础台账</Button>
              <Button theme="danger" variant="outline" onClick={() => downloadFile('/export/workflows', '流程台账.xlsx')}>下载流程台账</Button>
              <Button theme="danger" variant="outline" onClick={() => downloadFile('/export/stats', '统计报表.xlsx')}>下载统计报表</Button>
            </div>
          </Card>
        )}

        {activeView === 'workflowConfig' && (
          <Card title="流程时限配置">
            <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>步骤</th>
                  <th>名称</th>
                  <th>开始时间</th>
                  <th>截止时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((item) => (
                  <ConfigRow key={item.stepCode} item={item} onSave={saveConfig} />
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

function LoginScreen({ onLogin, themeClass, onToggleTheme, isMobile }) {
  const [username, setUsername] = useState('zz001');
  const [password, setPassword] = useState('123456');

  return (
    <div className={`login-screen ${themeClass} ${isMobile ? 'is-mobile' : ''}`}>
      <div className="login-panel">
        <div>
          <div className="login-title">党员发展管理后台</div>
          <div className="login-subtitle">用于台账查看、审核审批、统计分析和流程配置</div>
          {themeClass === 'theme-propaganda' && <div className="login-banner">高标准推进党员发展工作信息化建设</div>}
        </div>
        <Input value={username} onChange={setUsername} placeholder="账号" size="large" />
        <Input type="password" value={password} onChange={setPassword} placeholder="密码" size="large" />
        <Button theme="danger" size="large" block onClick={() => onLogin({ username, password })}>
          登录后台
        </Button>
        <Card title="演示账号" size="small">
          <ul className="sample-list">
            {SAMPLE_ACCOUNTS.map((item) => (
              <li key={item.username}>
                <button type="button" onClick={() => setUsername(item.username)}>
                  {item.role}：{item.username}
                </button>
              </li>
            ))}
          </ul>
          <div className="sample-note">统一密码：123456</div>
        </Card>
        <Card title="更多选项" size="small">
          <div className="login-settings">
            <span>当前：{themeClass.includes('theme-propaganda') ? '样式2' : '样式1'}</span>
            <Button size="small" theme="warning" variant="outline" onClick={onToggleTheme}>切换样式</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, desc }) {
  return (
    <Card className="metric-panel">
      <div className="metric-title">{title}</div>
      <div className="metric-number">{value}</div>
      <div className="metric-desc">{desc}</div>
    </Card>
  );
}

function GuidancePanel() {
  return (
    <div className="guidance-layout">
      <Card title={PROCESS_GUIDANCE.title}>
        <div className="guidance-intro">{PROCESS_GUIDANCE.intro}</div>
        <div className="guidance-list">
          {PROCESS_GUIDANCE.rules.map((item, index) => (
            <div className="guidance-item" key={item}>
              <div className="guidance-index">{index + 1}</div>
              <div className="guidance-text">{item}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="流程示意">
        <div className="flow-stage-list">
          {PROCESS_GUIDANCE.stages.map((item) => (
            <div className="flow-stage-card" key={item.code}>
              <div className="flow-stage-top">
                <div className="flow-stage-title">{item.title} · {item.subtitle}</div>
                <Tag theme="danger" variant="light">{item.stepRange}</Tag>
              </div>
              <div className="flow-stage-text">{item.summary}</div>
            </div>
          ))}
        </div>
        <div className="flow-legend-list">
          {PROCESS_GUIDANCE.legends.map((item) => (
            <div className="flow-legend-item" key={item}>{item}</div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SimpleTableCard({ title, columns, rows, compact = false }) {
  if (compact) {
    return (
      <Card title={title}>
        <div className="simple-list">
          {rows.map((row, index) => (
            <div className="simple-list-card" key={`${title}-${index}`}>
              {columns.map((column, columnIndex) => (
                <div className="simple-list-row" key={`${column}-${columnIndex}`}>
                  <div className="simple-list-label">{column}</div>
                  <div className="simple-list-value">{row[columnIndex] || '-'}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
    );
  }
  return (
    <Card title={title}>
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${title}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Card>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value || '-'}</div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <Card>
      <div className="empty-state">{text}</div>
    </Card>
  );
}

function ConfigRow({ item, onSave }) {
  const [startAt, setStartAt] = useState(item.startAt || '');
  const [endAt, setEndAt] = useState(item.endAt || '');

  return (
    <tr>
      <td>{item.sortOrder}</td>
      <td>{item.name}</td>
      <td><input className="inline-input" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></td>
      <td><input className="inline-input" value={endAt} onChange={(event) => setEndAt(event.target.value)} /></td>
      <td><Button size="small" theme="danger" variant="outline" onClick={() => onSave(item.stepCode, startAt, endAt)}>保存</Button></td>
    </tr>
  );
}

export default App;
