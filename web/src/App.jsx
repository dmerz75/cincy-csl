import React, {useState, useEffect} from 'react'

export default function App(){
  const [leagueId, setLeagueId] = useState(1)
  const [weeks, setWeeks] = useState(8)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api/admin'
  const [view, setView] = useState('home') // 'home' | 'preview' | 'schedules'

  async function preview(){
    setLoading(true)
    setError(null)
    setData(null)
    try{
      const resp = await fetch(`${API_BASE}/preview_schedule`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({league_id: Number(leagueId), weeks: Number(weeks)})
      })
      if(!resp.ok) throw new Error(await resp.text())
      const json = await resp.json()
      setData(json)
    }catch(e){
      setError(String(e))
    }finally{
      setLoading(false)
    }
  }

  function SchedulesView({apiBase}){
    const [league, setLeague] = useState(leagueId)
    const [weeksLocal, setWeeksLocal] = useState(8)
    const [dayFilter, setDayFilter] = useState('all')
    const [loadingS, setLoadingS] = useState(false)
    const [sdata, setSdata] = useState(null)
    const [errS, setErrS] = useState(null)

    async function load(){
      setLoadingS(true); setErrS(null); setSdata(null)
      try{
        const resp = await fetch(`${apiBase}/preview_schedule`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({league_id: Number(league), weeks: Number(weeksLocal)})
        })
        if(!resp.ok) throw new Error(await resp.text())
        const j = await resp.json()
        setSdata(j)
      }catch(e){ setErrS(String(e)) }
      setLoadingS(false)
    }

    function exportCsv(){
      const params = new URLSearchParams()
      params.append('league_id', league)
      if(dayFilter !== 'all') params.append('day', dayFilter)
      const url = `${apiBase}/export_csv?` + params.toString()
      window.open(url, '_blank')
    }

    function matchesForDay(){
      if(!sdata) return []
      if(dayFilter==='all') return sdata.assigned
      const d = Number(dayFilter)
      return sdata.assigned.filter(a=>{
        const dt = new Date(a.datetime)
        return dt.getUTCDay() === d
      })
    }

    return (
      <div>
          <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:12}}>
          <label>League ID <input type="number" value={league} onChange={e=>setLeague(e.target.value)} /></label>
          <label>Weeks <input type="number" value={weeksLocal} onChange={e=>setWeeksLocal(e.target.value)} /></label>
          <label>Day <select value={dayFilter} onChange={e=>setDayFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="0">Sunday</option>
            <option value="1">Monday</option>
            <option value="2">Tuesday</option>
            <option value="3">Wednesday</option>
            <option value="4">Thursday</option>
            <option value="5">Friday</option>
            <option value="6">Saturday</option>
          </select></label>
          <button onClick={load} disabled={loadingS}>{loadingS? 'Loading...':'Load Schedules'}</button>
          <button onClick={exportCsv} disabled={loadingS}>{'Export CSV'}</button>
        </div>
        {errS && <div className="error">{errS}</div>}
        {!sdata && !errS && <div style={{color:'#6b7280'}}>No schedules loaded — click "Load Schedules".</div>}
        {sdata && (
          <div>
            <h3>Assigned Matches ({matchesForDay().length})</h3>
            <table>
              <thead><tr><th>Date</th><th>Home</th><th>Away</th><th>Time (UTC)</th><th>Court</th></tr></thead>
              <tbody>
                {matchesForDay().map(a=>{
                  const dt = new Date(a.datetime)
                  return (<tr key={a.id}><td>{dt.toISOString().slice(0,10)}</td><td>{a.home}</td><td>{a.away}</td><td>{dt.toISOString().slice(11,19)}</td><td>{a.court_id}</td></tr>)
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  function Home({apiBase}){
    const [leagues, setLeagues] = useState(null)
    const [teams, setTeams] = useState(null)
    const [loading, setLoading] = useState(false)
    const [err, setErr] = useState(null)

    useEffect(()=>{ loadLeagues() }, [])

    async function loadLeagues(){
      setLoading(true); setErr(null)
      try{
        const resp = await fetch(`${apiBase}/leagues`)
        if(!resp.ok) throw new Error(await resp.text())
        setLeagues(await resp.json())
      }catch(e){ setErr(String(e)) }
      setLoading(false)
    }

    async function loadTeamsFor(league_id){
      setTeams(null); setErr(null)
      try{
        const resp = await fetch(`${apiBase}/teams?league_id=${league_id}`)
        if(!resp.ok) throw new Error(await resp.text())
        setTeams(await resp.json())
      }catch(e){ setErr(String(e)) }
    }

    return (
      <div>
        <h2>Dashboard</h2>
        <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
          <div style={{flex:1}}>
            <h3>Leagues</h3>
            {loading && <div>Loading leagues...</div>}
            {err && <div className="error">{err}</div>}
            {!loading && leagues && (
              <ul>
                {leagues.map(l=> (
                  <li key={l.id} style={{marginBottom:6}}>
                    <strong>{l.name}</strong> (day: {l.day_of_week})
                                <div style={{marginTop:6}}>
                                  <button onClick={()=>{ setLeagueId(l.id); setView('preview') }}>Preview Schedule</button>
                                  <button style={{marginLeft:8}} onClick={()=>loadTeamsFor(l.id)}>Load Teams</button>
                                  <a style={{marginLeft:8}} href={`${apiBase}/export_csv?league_id=${l.id}`} target="_blank" rel="noreferrer">Export CSV</a>
                                </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div style={{flex:1}}>
            <h3>Teams</h3>
            {!teams && <div style={{color:'#6b7280'}}>No teams loaded. Click "Load Teams" on a league.</div>}
            {teams && (
              <ul>
                {teams.map(t=> (<li key={t.id}>{t.name} — {t.contact_email || t.captain_phone || 'no contact'}</li>))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )
  }

      return (
        <>
          <header className="app-header">
            <div className="container-header">
              <h1>Cincy CSL</h1>
              <p>Admin — Schedule Preview</p>
            </div>
          </header>
              <div className="nav">
                <button onClick={()=>setView('preview')} className={view==='preview'?'active':''}>Schedule Preview</button>
                <button onClick={()=>setView('schedules')} className={view==='schedules'?'active':''}>Current Schedules</button>
              </div>

              <div className="container">
                {view === 'preview' && (
      <div className="controls">
        <label>League ID <input type="number" value={leagueId} onChange={e=>setLeagueId(e.target.value)} /></label>
        <label>Weeks <input type="number" value={weeks} onChange={e=>setWeeks(e.target.value)} /></label>
        <button onClick={preview} disabled={loading}>{loading ? 'Loading...' : 'Preview'}</button>
      </div>
      )}
      {error && <div className="error">Error: {error}</div>}
      
      {view === 'schedules' && (
        <SchedulesView apiBase={API_BASE} />
      )}
      {data && (
        <div>
          <h2>Assigned Matches</h2>
          <table>
            <thead><tr><th>ID</th><th>Home</th><th>Away</th><th>Date/Time</th><th>Court</th></tr></thead>
            <tbody>
              {data.assigned.map(a=> (
                <tr key={a.id}><td>{a.id}</td><td>{a.home}</td><td>{a.away}</td><td>{a.datetime}</td><td>{a.court_id}</td></tr>
              ))}
            </tbody>
          </table>
          {data.unassigned && data.unassigned.length>0 && (
            <>
              <h2>Unassigned Matches</h2>
              <table>
                <thead><tr><th>ID</th><th>Home</th><th>Away</th></tr></thead>
                <tbody>
                  {data.unassigned.map(u=> (<tr key={u.id}><td>{u.id}</td><td>{u.home}</td><td>{u.away}</td></tr>))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
          <footer style={{marginTop:20}}>
            <small>Note: runs against local FastAPI at <code>http://127.0.0.1:8000</code>. Ensure the server is running.</small>
          </footer>
        </div>
      </>
    )
}
