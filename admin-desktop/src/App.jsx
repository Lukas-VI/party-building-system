import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, MessagePlugin, Select, Space, Tag } from 'tdesign-react';
import { desktopToMobileUrl, isMobileDevice, shouldSkipAutoRoute } from './deviceRoute';

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'https://havensky.cn/DJ_api' : '/DJ_api');
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
  const [bootstrap, setBootstrap] = useState({ loginHints: [], defaultPasswordHint: '' });
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
  const [workflowReviews, setWorkflowReviews] = useState([]);
  const [registrationRequests, setRegistrationRequests] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [orgStats, setOrgStats] = useState([]);
  const [branchStats, setBranchStats] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [assignForm, setAssignForm] = useState({ userId: '', roleId: 'branchSecretary' });
  const [staffImportFile, setStaffImportFile] = useState(null);
  const [staffImportResult, setStaffImportResult] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (shouldSkipAutoRoute()) return;
    if (!isMobileDevice()) return;
    const currentPath = window.location.pathname || '';
    if (!currentPath.startsWith('/web-admin')) return;
    window.location.replace(desktopToMobileUrl());
  }, []);

  const menus = useMemo(() => {
    if (!user) return [];
    const base = ['dashboard', ...(user.menus || [])];
    if (!base.includes('workflowDetail')) base.push('workflowDetail');
    return Array.from(new Set(base));
  }, [user]);

  const themeClass = themeMode === 'propaganda' ? 'theme-propaganda' : 'theme-classic';


  /**
   * 发送API请求的通用函数
   * @param {string} path - API路径（相对于API_BASE）
   * @param {object} options - fetch选项，包括method、body等
   * @returns {Promise<any>} 返回API响应数据或Blob
   * @throws {Error} 当请求失败或响应码不为0时抛出错误
   */
  async function api(path, options = {}) {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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
    api('/public/bootstrap')
      .then((result) => setBootstrap(result))
      .catch((error) => {
        MessagePlugin.error(error.message);
      });
  }, []);

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
        const workflowResult = await api('/reviews/pending');
        const registrationResult = user.permissions?.some((item) => item.id === 'approve_registration')
          ? await api('/auth/registration-requests')
          : [];
        setWorkflowReviews(workflowResult);
        setRegistrationRequests(registrationResult);
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
          comment: status === 'approved' ? '后台审核通过' : '后台审核退回',
        }),
      });
      MessagePlugin.success(status === 'approved' ? '已通过' : '已退回');
      refreshForView('reviews');
    } catch (error) {
      MessagePlugin.error(error.message);
    }
  }

  async function approveRegistration(requestNo, status) {
    try {
      await api('/auth/approve-registration', {
        method: 'POST',
        body: JSON.stringify({ requestNo, status }),
      });
      MessagePlugin.success(status === 'approved' ? '注册已通过' : '注册已驳回');
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

  async function importStaff() {
    if (!staffImportFile) {
      MessagePlugin.warning('请先选择人员表格');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', staffImportFile);
      const result = await api('/orgs/import-staff', {
        method: 'POST',
        body: formData,
      });
      setStaffImportResult(result);
      MessagePlugin.success(`导入完成：新增 ${result.imported}，更新 ${result.updated}，失败 ${result.failed}`);
      refreshForView('organizations');
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
    return <LoginScreen onLogin={handleLogin} themeClass={themeClass} onToggleTheme={toggleThemeMode} isMobile={isMobile} bootstrap={bootstrap} />;
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
          <div className="content-stack">
            {user.permissions?.some((item) => item.id === 'approve_registration') && (
              <Card title="待审核注册申请">
                <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>姓名</th>
                      <th>学号/工号</th>
                      <th>单位</th>
                      <th>支部</th>
                      <th>申请时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrationRequests.length ? registrationRequests.map((item) => (
                      <tr key={item.requestNo}>
                        <td>{item.name}</td>
                        <td>{item.employeeNo}</td>
                        <td>{item.orgName}</td>
                        <td>{item.branchName}</td>
                        <td>{item.createdAt}</td>
                        <td>
                          <Space>
                            <Button size="small" theme="success" onClick={() => approveRegistration(item.requestNo, 'approved')}>通过注册</Button>
                            <Button size="small" theme="danger" variant="outline" onClick={() => approveRegistration(item.requestNo, 'rejected')}>驳回注册</Button>
                          </Space>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="6">当前没有待审核注册申请。</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </Card>
            )}
            <Card title="待审核流程事项">
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
                  {workflowReviews.length ? workflowReviews.map((item) => (
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
                  )) : (
                    <tr>
                      <td colSpan="6">当前没有待审核流程节点。</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </Card>
          </div>
        )}

        {activeView === 'organizations' && (
          <div className="content-stack">
            <div className="split-grid">
              <SimpleTableCard title="单位清单" columns={['单位名称']} rows={orgs.map((item) => [item.name])} compact={isMobile} />
              <SimpleTableCard title="支部清单" columns={['支部名称', '所属单位']} rows={branches.map((item) => [item.name, orgs.find((org) => org.id === item.orgId)?.name || ''])} compact={isMobile} />
            </div>
            <Card title="预置人员导入">
              <div className="section-note">
                支持 Excel/CSV。至少包含“学号/工号、姓名”，可选“单位ID/单位、支部ID/支部、角色、状态”。默认导入为 inactive 预置人员，供服务号首次注册核验。
              </div>
              <div className="filter-grid">
                <input
                  className="inline-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(event) => setStaffImportFile(event.target.files?.[0] || null)}
                />
              </div>
              <Button theme="danger" style={{ marginTop: 16 }} onClick={importStaff}>导入人员表格</Button>
              {staffImportResult && (
                <div className="section-note" style={{ marginTop: 12 }}>
                  新增 {staffImportResult.imported} 人，更新 {staffImportResult.updated} 人，失败 {staffImportResult.failed} 行。
                  {!!staffImportResult.errors?.length && (
                    <ul className="sample-list">
                      {staffImportResult.errors.map((item) => (
                        <li key={`${item.row}-${item.message}`}>第 {item.row} 行：{item.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
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

function LoginScreen({ onLogin, themeClass, onToggleTheme, isMobile, bootstrap }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

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
        {!!bootstrap?.loginHints?.length && (
          <Card title="快速填充账号" size="small">
            <ul className="sample-list">
              {bootstrap.loginHints.map((item) => (
                <li key={item.username}>
                  <button type="button" onClick={() => setUsername(item.username)}>
                    {item.roleLabel}：{item.username}
                  </button>
                </li>
              ))}
            </ul>
            {bootstrap.defaultPasswordHint && <div className="sample-note">{bootstrap.defaultPasswordHint}</div>}
          </Card>
        )}
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
