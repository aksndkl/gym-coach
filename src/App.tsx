import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Role = 'coach' | 'student'
type Profile = { id: string; display_name: string; role: Role }
type Student = { id: string; display_name: string; role: Role }
type Plan = {
  id: string
  student_id: string
  title: string
  details: string
  starts_on: string | null
  created_at: string
}
type Appointment = {
  id: string
  coach_id: string
  student_id: string
  starts_at: string
  duration_minutes: number
  status: 'requested' | 'confirmed' | 'cancelled'
  note: string
}

function friendlyError(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试。'
}

function displayDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function localDateTimeInputValue() {
  const localDate = new Date()
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset())
  return localDate.toISOString().slice(0, 16)
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setProfile(null)
    })
    return () => authListener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session?.user) {
      setProfile(null)
      setProfileLoading(false)
      return
    }

    let active = true
    setProfileLoading(true)
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error: profileError }) => {
        if (!active) return
        if (profileError) setError(profileError.message)
        else setProfile(data as Profile)
        setProfileLoading(false)
      })
    return () => {
      active = false
    }
  }, [session])

  if (!supabase) {
    return (
      <main className="setup-page">
        <section className="setup-card">
          <span className="eyebrow">练习册 · 教练工作台</span>
          <h1>先连接你的 Supabase 项目</h1>
          <p>应用已就绪。配置本地环境变量并执行数据库迁移后，即可启用账号与数据保存。</p>
          <ol>
            <li>复制项目根目录的 <code>.env.example</code> 为 <code>.env</code>。</li>
            <li>填写 Supabase Project URL 和公开 anon / publishable key。</li>
            <li>在 Supabase SQL Editor 执行 <code>supabase/migrations/202610270001_initial_schema.sql</code>。</li>
            <li>运行 <code>npm install</code> 与 <code>npm run dev</code>。</li>
          </ol>
          <p className="privacy-note">请勿把 service role key 放入前端或提交到代码库。当前版本仅供虚构测试资料使用。</p>
        </section>
      </main>
    )
  }

  if (!authReady || (session && profileLoading)) {
    return <main className="center-state">正在连接你的工作台…</main>
  }

  if (session && !profile) {
    return (
      <main className="center-state">
        <section className="message-card">
          <h1>暂时无法读取账号资料</h1>
          <p>{error || '请确认数据库迁移已执行，再重新登录。'}</p>
          <button className="button button-secondary" onClick={() => { if (supabase) void supabase.auth.signOut() }}>
            退出登录
          </button>
        </section>
      </main>
    )
  }

  if (!session) {
    return (
      <AuthScreen
        error={error}
        notice={notice}
        clearMessages={() => {
          setError('')
          setNotice('')
        }}
        onError={setError}
        onNotice={setNotice}
      />
    )
  }

  return (
    <Dashboard
      session={session}
      profile={profile!}
      onProfileUpdated={(displayName) => {
        setProfile((current) => current ? { ...current, display_name: displayName } : current)
      }}
      error={error}
      notice={notice}
      onError={setError}
      onNotice={setNotice}
      onSignOut={() => { if (supabase) void supabase.auth.signOut() }}
    />
  )
}

function AuthScreen({
  error,
  notice,
  clearMessages,
  onError,
  onNotice,
}: {
  error: string
  notice: string
  clearMessages: () => void
  onError: (message: string) => void
  onNotice: (message: string) => void
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    clearMessages()
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() } },
        })
        if (authError) throw authError
        if (!data.session) {
          onNotice('注册成功。请按邮件提示完成验证，然后返回登录。')
        } else {
          onNotice('账号已创建。新账号默认为学员，如需教练账号，请由项目管理员设置角色。')
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) throw authError
      }
    } catch (authError) {
      onError(friendlyError(authError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-story">
        <span className="eyebrow">COACHING, WITH INTENTION</span>
        <h1>把每一次<br />训练，练得更好。</h1>
        <p>简单安排计划、保持沟通，让进步有迹可循。</p>
        <div className="story-mark" aria-hidden="true">01 / 04</div>
      </div>
      <section className="auth-card">
        <span className="eyebrow">练习册 · 教练工作台</span>
        <h2>{mode === 'login' ? '欢迎回来' : '创建账号'}</h2>
        <p className="muted">{mode === 'login' ? '登录以继续你的训练。' : '注册后将以学员身份开始。'}</p>
        <form onSubmit={submit} className="form-stack">
          {mode === 'signup' && (
            <label>
              怎么称呼你
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={100}
                required
              />
            </label>
          )}
          <label>
            邮箱
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
            {mode === 'signup' && <small>至少 8 个字符</small>}
          </label>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          {notice && <p className="alert alert-success" role="status">{notice}</p>}
          <button className="button button-primary" disabled={busy}>
            {busy ? '请稍候…' : mode === 'login' ? '登录' : '创建账号'}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            clearMessages()
            setMode(mode === 'login' ? 'signup' : 'login')
          }}
        >
          {mode === 'login' ? '还没有账号？创建一个' : '已有账号？返回登录'}
        </button>
        <p className="privacy-note">请勿在此填写诊断、病史或其他敏感健康资料。</p>
      </section>
    </main>
  )
}

function Dashboard({
  session,
  profile,
  onProfileUpdated,
  error,
  notice,
  onError,
  onNotice,
  onSignOut,
}: {
  session: Session
  profile: Profile
  onProfileUpdated: (displayName: string) => void
  error: string
  notice: string
  onError: (message: string) => void
  onNotice: (message: string) => void
  onSignOut: () => void
}) {
  const [students, setStudents] = useState<Student[]>([])
  const [coach, setCoach] = useState<Student | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [coachId, setCoachId] = useState('')
  const [planTitle, setPlanTitle] = useState('')
  const [planDetails, setPlanDetails] = useState('')
  const [planStudentId, setPlanStudentId] = useState('')
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [editingPlanTitle, setEditingPlanTitle] = useState('')
  const [editingPlanDetails, setEditingPlanDetails] = useState('')
  const [bookingTime, setBookingTime] = useState('')
  const [bookingNote, setBookingNote] = useState('')
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [busy, setBusy] = useState(false)

  async function loadData() {
    if (!supabase) return
    setLoading(true)
    onError('')
    try {
      let studentIds: string[] = []
      let coachProfile: Student | null = null
      if (profile.role === 'coach') {
        const { data, error: linkError } = await supabase
          .from('coach_students')
          .select('student_id')
          .eq('coach_id', profile.id)
        if (linkError) throw linkError
        studentIds = (data ?? []).map((row) => row.student_id as string)
        if (studentIds.length) {
          const { data: people, error: peopleError } = await supabase
            .from('profiles')
            .select('id, display_name, role')
            .in('id', studentIds)
          if (peopleError) throw peopleError
          setStudents((people ?? []) as Student[])
        } else {
          setStudents([])
        }
        setCoach(null)
      } else {
        const { data, error: linkError } = await supabase
          .from('coach_students')
          .select('coach_id')
          .eq('student_id', profile.id)
          .maybeSingle()
        if (linkError) throw linkError
        if (data?.coach_id) {
          const { data: coachData, error: coachError } = await supabase
            .from('profiles')
            .select('id, display_name, role')
            .eq('id', data.coach_id)
            .single()
          if (coachError) throw coachError
          coachProfile = coachData as Student
        }
        setCoach(coachProfile)
        setStudents([])
        studentIds = [profile.id]
      }

      let planQuery = supabase.from('training_plans').select('*').order('created_at', { ascending: false })
      if (profile.role === 'coach') {
        planQuery = studentIds.length ? planQuery.in('student_id', studentIds) : planQuery.eq('student_id', '')
      } else {
        planQuery = planQuery.eq('student_id', profile.id)
      }
      const { data: planData, error: planError } = await planQuery
      if (planError) throw planError
      setPlans((planData ?? []) as Plan[])

      let appointmentQuery = supabase
        .from('appointments')
        .select('*')
        .order('starts_at', { ascending: true })
      if (profile.role === 'coach') {
        appointmentQuery = studentIds.length
          ? appointmentQuery.in('student_id', studentIds)
          : appointmentQuery.eq('student_id', '')
      } else {
        appointmentQuery = appointmentQuery.eq('student_id', profile.id)
      }
      const { data: appointmentData, error: appointmentError } = await appointmentQuery
      if (appointmentError) throw appointmentError
      setAppointments((appointmentData ?? []) as Appointment[])
    } catch (loadError) {
      onError(friendlyError(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [profile.id, profile.role])

  async function linkCoach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    onError('')
    onNotice('')
    try {
      const { error: linkError } = await supabase.rpc('request_coach_link', {
        p_coach_id: coachId.trim(),
      })
      if (linkError) throw linkError
      setCoachId('')
      onNotice('已关联教练账号。')
      await loadData()
    } catch (actionError) {
      onError(friendlyError(actionError))
    } finally {
      setBusy(false)
    }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    onError('')
    onNotice('')
    try {
      const { error: insertError } = await supabase.from('training_plans').insert({
        coach_id: profile.id,
        student_id: planStudentId,
        title: planTitle.trim(),
        details: planDetails.trim(),
      })
      if (insertError) throw insertError
      setPlanTitle('')
      setPlanDetails('')
      onNotice('训练计划已保存。')
      await loadData()
    } catch (actionError) {
      onError(friendlyError(actionError))
    } finally {
      setBusy(false)
    }
  }

  async function requestAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !coach) return
    setBusy(true)
    onError('')
    onNotice('')
    try {
      const { error: insertError } = await supabase.from('appointments').insert({
        coach_id: coach.id,
        student_id: profile.id,
        starts_at: new Date(bookingTime).toISOString(),
        duration_minutes: 60,
        note: bookingNote.trim(),
      })
      if (insertError) throw insertError
      setBookingTime('')
      setBookingNote('')
      onNotice('预约请求已发送。')
      await loadData()
    } catch (actionError) {
      onError(friendlyError(actionError))
    } finally {
      setBusy(false)
    }
  }

  async function updateAppointment(appointment: Appointment, status: Appointment['status']) {
    if (!supabase) return
    setBusy(true)
    onError('')
    onNotice('')
    try {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status })
        .eq('id', appointment.id)
      if (updateError) throw updateError
      onNotice('预约状态已更新。')
      await loadData()
    } catch (actionError) {
      onError(friendlyError(actionError))
    } finally {
      setBusy(false)
    }
  }

  async function savePlan(event: FormEvent<HTMLFormElement>, planId: string) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    onError('')
    onNotice('')
    try {
      const { error: updateError } = await supabase
        .from('training_plans')
        .update({ title: editingPlanTitle.trim(), details: editingPlanDetails.trim() })
        .eq('id', planId)
      if (updateError) throw updateError
      setEditingPlanId(null)
      onNotice('训练计划已更新。')
      await loadData()
    } catch (actionError) {
      onError(friendlyError(actionError))
    } finally {
      setBusy(false)
    }
  }

  async function deletePlan(planId: string) {
    if (!supabase || !window.confirm('确定删除这份训练计划吗？')) return
    setBusy(true)
    onError('')
    onNotice('')
    try {
      const { error: deleteError } = await supabase.from('training_plans').delete().eq('id', planId)
      if (deleteError) throw deleteError
      onNotice('训练计划已删除。')
      await loadData()
    } catch (actionError) {
      onError(friendlyError(actionError))
    } finally {
      setBusy(false)
    }
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    onError('')
    onNotice('')
    try {
      const nextName = displayName.trim()
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ display_name: nextName })
        .eq('id', profile.id)
      if (updateError) throw updateError
      onProfileUpdated(nextName)
      onNotice('个人资料已保存。')
    } catch (actionError) {
      onError(friendlyError(actionError))
    } finally {
      setBusy(false)
    }
  }

  const studentName = (id: string) => students.find((student) => student.id === id)?.display_name || '学员'

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="练习册首页"><span className="brand-icon">练</span>练习册</a>
        <div className="topbar-user">
          <span className="role-pill">{profile.role === 'coach' ? '教练' : '学员'}</span>
          <span>{profile.display_name || session.user.email}</span>
          <button className="text-button" onClick={onSignOut}>退出</button>
        </div>
      </header>

      <section className="welcome">
        <div>
          <span className="eyebrow">{profile.role === 'coach' ? 'COACH DESK' : 'YOUR TRAINING'}</span>
          <h1>{profile.role === 'coach' ? '今天，陪学员再进步一点。' : '稳稳训练，持续进步。'}</h1>
          <p>{profile.role === 'coach' ? '在一个地方管理学员、计划和预约。' : '你的训练安排和预约都在这里。'}</p>
        </div>
        {profile.role === 'coach' && (
          <div className="coach-code">
            <span>学员关联码</span>
            <code>{profile.id}</code>
            <small>分享给学员，由学员主动关联</small>
          </div>
        )}
      </section>

      {(error || notice) && (
        <div className={`alert ${error ? 'alert-error' : 'alert-success'}`} role={error ? 'alert' : 'status'}>
          {error || notice}
        </div>
      )}

      {loading ? (
        <div className="center-state">正在读取训练资料…</div>
      ) : (
        <div className="dashboard-grid">
          <section className="panel">
            <div className="panel-heading">
              <div><span className="eyebrow">PROFILE</span><h2>个人资料</h2></div>
            </div>
            <form className="inline-form" onSubmit={updateProfile}>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                aria-label="显示名称"
                placeholder="显示名称"
                maxLength={100}
                required
              />
              <button className="button button-dark" disabled={busy}>保存</button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div><span className="eyebrow">01 / PEOPLE</span><h2>{profile.role === 'coach' ? '我的学员' : '我的教练'}</h2></div>
              <span className="count-chip">{profile.role === 'coach' ? students.length : coach ? 1 : 0}</span>
            </div>
            {profile.role === 'coach' ? (
              students.length ? (
                <div className="people-list">
                  {students.map((student) => (
                    <div className="person-row" key={student.id}>
                      <span className="avatar">{(student.display_name || '学').slice(0, 1)}</span>
                      <span><strong>{student.display_name || '未设置姓名'}</strong><small>已关联学员</small></span>
                    </div>
                  ))}
                </div>
              ) : <p className="empty-state">还没有关联学员。把上方关联码分享给学员即可开始。</p>
            ) : coach ? (
              <div className="person-row">
                <span className="avatar avatar-coach">{(coach.display_name || '教').slice(0, 1)}</span>
                <span><strong>{coach.display_name || '教练'}</strong><small>已关联教练</small></span>
              </div>
            ) : (
              <>
                <p className="empty-state">输入教练提供的关联码，建立训练关系。</p>
                <form className="inline-form" onSubmit={linkCoach}>
                  <input
                    value={coachId}
                    onChange={(event) => setCoachId(event.target.value)}
                    placeholder="教练关联码"
                    aria-label="教练关联码"
                    required
                  />
                  <button className="button button-dark" disabled={busy}>关联</button>
                </form>
              </>
            )}
          </section>

          {profile.role === 'coach' && students.length > 0 && (
            <section className="panel">
              <div className="panel-heading">
                <div><span className="eyebrow">02 / PLAN</span><h2>创建训练计划</h2></div>
              </div>
              <form className="form-stack compact-form" onSubmit={createPlan}>
                <label>学员
                  <select value={planStudentId} onChange={(event) => setPlanStudentId(event.target.value)} required>
                    <option value="">选择学员</option>
                    {students.map((student) => <option value={student.id} key={student.id}>{student.display_name || '未设置姓名'}</option>)}
                  </select>
                </label>
                <label>计划名称
                  <input value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} maxLength={120} required />
                </label>
                <label>训练安排
                  <textarea
                    value={planDetails}
                    onChange={(event) => setPlanDetails(event.target.value)}
                    placeholder="记录动作、组数和次数等训练安排；不要填写医疗或病史信息。"
                    maxLength={5000}
                    rows={3}
                  />
                </label>
                <button className="button button-primary" disabled={busy}>保存训练计划</button>
              </form>
            </section>
          )}

          <section className="panel panel-wide">
            <div className="panel-heading">
              <div><span className="eyebrow">03 / TRAINING</span><h2>训练计划</h2></div>
              <span className="count-chip">{plans.length}</span>
            </div>
            {plans.length ? (
              <div className="record-list">
                {plans.map((plan) => (
                  <article className="record-card" key={plan.id}>
                    {editingPlanId === plan.id ? (
                      <form className="form-stack compact-form" onSubmit={(event) => void savePlan(event, plan.id)}>
                        <label>计划名称
                          <input
                            value={editingPlanTitle}
                            onChange={(event) => setEditingPlanTitle(event.target.value)}
                            maxLength={120}
                            required
                          />
                        </label>
                        <label>训练安排
                          <textarea
                            value={editingPlanDetails}
                            onChange={(event) => setEditingPlanDetails(event.target.value)}
                            maxLength={5000}
                            rows={3}
                          />
                        </label>
                        <div className="record-actions">
                          <button className="button button-primary" disabled={busy}>保存修改</button>
                          <button className="text-button" type="button" onClick={() => setEditingPlanId(null)}>取消</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="record-topline">
                          <h3>{plan.title}</h3>
                          {profile.role === 'coach' && <span className="subtle-tag">{studentName(plan.student_id)}</span>}
                        </div>
                        {plan.details && <p className="record-details">{plan.details}</p>}
                        <small>{plan.starts_on ? `开始日期：${plan.starts_on}` : `创建于 ${displayDate(plan.created_at)}`}</small>
                        {profile.role === 'coach' && (
                          <div className="record-actions">
                            <button
                              className="button button-secondary"
                              disabled={busy}
                              onClick={() => {
                                setEditingPlanId(plan.id)
                                setEditingPlanTitle(plan.title)
                                setEditingPlanDetails(plan.details)
                              }}
                            >
                              编辑计划
                            </button>
                            <button className="text-button danger-link" disabled={busy} onClick={() => void deletePlan(plan.id)}>删除</button>
                          </div>
                        )}
                      </>
                    )}
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">{profile.role === 'student' && !coach ? '关联教练后即可查看训练计划。' : '暂时没有训练计划。'}</p>}
          </section>

          {profile.role === 'student' && coach && (
            <section className="panel">
              <div className="panel-heading">
                <div><span className="eyebrow">04 / BOOKING</span><h2>预约训练</h2></div>
              </div>
              <form className="form-stack compact-form" onSubmit={requestAppointment}>
                <label>希望的训练时间
                  <input
                    type="datetime-local"
                    value={bookingTime}
                    onChange={(event) => setBookingTime(event.target.value)}
                    min={localDateTimeInputValue()}
                    required
                  />
                </label>
                <label>备注 <span className="muted">(可选)</span>
                  <textarea
                    value={bookingNote}
                    onChange={(event) => setBookingNote(event.target.value)}
                    placeholder="仅填写时间安排等预约信息。"
                    maxLength={500}
                    rows={2}
                  />
                </label>
                <button className="button button-primary" disabled={busy}>发送预约请求</button>
              </form>
            </section>
          )}

          <section className="panel panel-wide">
            <div className="panel-heading">
              <div><span className="eyebrow">05 / SCHEDULE</span><h2>训练预约</h2></div>
              <span className="count-chip">{appointments.length}</span>
            </div>
            {appointments.length ? (
              <div className="record-list">
                {appointments.map((appointment) => (
                  <article className="record-card appointment-card" key={appointment.id}>
                    <div className="record-topline">
                      <div>
                        <h3>{displayDate(appointment.starts_at)}</h3>
                        <p className="record-details">
                          {profile.role === 'coach' ? `${studentName(appointment.student_id)} · ` : ''}
                          {appointment.duration_minutes} 分钟
                          {appointment.note ? ` · ${appointment.note}` : ''}
                        </p>
                      </div>
                      <span className={`status-tag status-${appointment.status}`}>
                        {{ requested: '待确认', confirmed: '已确认', cancelled: '已取消' }[appointment.status]}
                      </span>
                    </div>
                    {appointment.status !== 'cancelled' && (
                      <div className="record-actions">
                        {profile.role === 'coach' && appointment.status === 'requested' && (
                          <button className="button button-secondary" disabled={busy} onClick={() => void updateAppointment(appointment, 'confirmed')}>确认预约</button>
                        )}
                        <button
                          className="text-button danger-link"
                          disabled={busy}
                          onClick={() => void updateAppointment(appointment, 'cancelled')}
                        >
                          {profile.role === 'coach' ? '取消预约' : '撤回预约'}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">暂时没有预约记录。</p>}
          </section>
        </div>
      )}

      <footer className="app-footer">使用虚构训练资料进行测试 · 不要填写诊断、病史或其他敏感健康信息</footer>
    </main>
  )
}
